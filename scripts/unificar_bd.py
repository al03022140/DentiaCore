"""
DentiaCore — Unificador de Bases de Datos Legacy
=================================================
Migra datos de las BD antiguas (Dent, dental_clinic) hacia la BD activa (DentiaCore).
- Copia documentos sin duplicar (_id).
- Maneja conflictos de índices únicos.
- Elimina registros huérfanos (refs a pacientes inexistentes).
- Opcionalmente elimina las BD legacy al terminar.

Compilar:  pyinstaller --onefile --name UnificarBD --icon=NONE scripts/unificar_bd.py
Ejecutar:  UnificarBD.exe
"""

import sys
import os
from datetime import datetime

try:
    from pymongo import MongoClient
    from pymongo.errors import BulkWriteError
except ImportError:
    print("ERROR: pymongo no está instalado.")
    print("Ejecuta:  pip install pymongo")
    input("\nPresiona Enter para salir...")
    sys.exit(1)

# ─── Configuración ───────────────────────────────────────────────
MONGO_HOST = os.environ.get("MONGODB_HOST", "mongodb://127.0.0.1:27017")
TARGET_DB = "DentiaCore"
SOURCE_DBS = ["Dent", "dental_clinic"]
SYSTEM_DBS = {"admin", "local", "config"}

# ─── Utilidades ──────────────────────────────────────────────────

def color(text, code):
    """ANSI color para terminal Windows 10+."""
    return f"\033[{code}m{text}\033[0m"

def green(t):  return color(t, "32")
def yellow(t): return color(t, "33")
def red(t):    return color(t, "31")
def cyan(t):   return color(t, "36")
def bold(t):   return color(t, "1")

def separator():
    print("─" * 56)

def confirm(prompt):
    """Pide confirmación y/n."""
    while True:
        resp = input(f"{prompt} (s/n): ").strip().lower()
        if resp in ("s", "si", "sí", "y", "yes"):
            return True
        if resp in ("n", "no"):
            return False
        print("  Responde 's' o 'n'.")


# ─── Detección de BD Legacy ─────────────────────────────────────

def detect_legacy_dbs(client):
    """Detecta qué BD legacy existen y tienen datos."""
    found = []
    all_dbs = [d["name"] for d in client.list_databases()]
    for name in SOURCE_DBS:
        if name in all_dbs:
            db = client[name]
            cols = db.list_collection_names()
            total = sum(db[c].count_documents({}) for c in cols)
            if total > 0:
                found.append({"name": name, "collections": cols, "total_docs": total})
    return found


# ─── Migración ──────────────────────────────────────────────────

def migrate_collection(src_col, tgt_col, col_name):
    """Copia documentos de src a tgt, evitando duplicados por _id e índices únicos."""
    src_docs = list(src_col.find({}))
    if not src_docs:
        return 0, 0

    # IDs que ya existen en destino
    existing_ids = set(
        str(d["_id"]) for d in tgt_col.find({}, {"_id": 1})
    )
    to_insert = [d for d in src_docs if str(d["_id"]) not in existing_ids]

    if not to_insert:
        print(f"    {col_name}: {len(src_docs)} docs — todos ya existen en destino")
        return len(src_docs), 0

    inserted = 0
    try:
        result = tgt_col.insert_many(to_insert, ordered=False)
        inserted = len(result.inserted_ids)
    except BulkWriteError as e:
        inserted = e.details.get("nInserted", 0)
        skipped = len(to_insert) - inserted
        print(f"    {col_name}: {inserted} migrados, {skipped} omitidos (índice único)")
        return len(src_docs), inserted

    print(f"    {col_name}: {green(f'{inserted}/{len(src_docs)}')} docs migrados")
    return len(src_docs), inserted


def run_migration(client, legacy_dbs):
    """Ejecuta la migración de todas las BD legacy a DentiaCore."""
    target = client[TARGET_DB]
    total_inserted = 0
    summary = []

    for db_info in legacy_dbs:
        name = db_info["name"]
        src_db = client[name]
        print(f"\n  {bold(f'Migrando desde «{name}»')} ({len(db_info['collections'])} colecciones)")

        for col_name in db_info["collections"]:
            found, inserted = migrate_collection(
                src_db[col_name], target[col_name], col_name
            )
            total_inserted += inserted
            if inserted > 0:
                summary.append((name, col_name, found, inserted))

    return total_inserted, summary


# ─── Limpieza de huérfanos ──────────────────────────────────────

def clean_orphans(client):
    """Elimina documentos que referencian pacientes inexistentes."""
    db = client[TARGET_DB]

    if "patients" not in db.list_collection_names():
        return 0

    patient_ids = set(
        str(d["_id"]) for d in db["patients"].find({}, {"_id": 1})
    )
    total_cleaned = 0

    # Odontogramas: campo patientId → Patient
    if "odontogramas" in db.list_collection_names():
        orphans = [
            d["_id"] for d in db["odontogramas"].find({}, {"_id": 1, "patientId": 1})
            if d.get("patientId") and str(d["patientId"]) not in patient_ids
        ]
        if orphans:
            db["odontogramas"].delete_many({"_id": {"$in": orphans}})
            print(f"    Odontogramas huérfanos eliminados: {len(orphans)}")
            total_cleaned += len(orphans)

    # Periodontogramas: campo patient → Patient
    if "periodontograms" in db.list_collection_names():
        orphans = [
            d["_id"] for d in db["periodontograms"].find({}, {"_id": 1, "patient": 1})
            if d.get("patient") and str(d["patient"]) not in patient_ids
        ]
        if orphans:
            db["periodontograms"].delete_many({"_id": {"$in": orphans}})
            print(f"    Periodontogramas huérfanos eliminados: {len(orphans)}")
            total_cleaned += len(orphans)

    # Historial periodontograma: campo patient → Patient
    if "periodontogram_history" in db.list_collection_names():
        perio_ids = set(
            str(d["_id"]) for d in db["periodontograms"].find({}, {"_id": 1})
        ) if "periodontograms" in db.list_collection_names() else set()

        orphans = [
            d["_id"] for d in db["periodontogram_history"].find(
                {}, {"_id": 1, "patient": 1, "periodontogram": 1}
            )
            if (d.get("patient") and str(d["patient"]) not in patient_ids)
            or (d.get("periodontogram") and str(d["periodontogram"]) not in perio_ids)
        ]
        if orphans:
            db["periodontogram_history"].delete_many({"_id": {"$in": orphans}})
            print(f"    Historial huérfano eliminado: {len(orphans)}")
            total_cleaned += len(orphans)

    # Pacientes con schema viejo (campo "name" en vez de "primer_nombre")
    if "patients" in db.list_collection_names():
        old_schema = list(db["patients"].find(
            {"name": {"$exists": True}, "primer_nombre": {"$exists": False}},
            {"_id": 1, "name": 1}
        ))
        if old_schema:
            ids = [d["_id"] for d in old_schema]
            # También limpiar sus refs
            for col_name, field in [("odontogramas", "patientId"), ("periodontograms", "patient")]:
                if col_name in db.list_collection_names():
                    db[col_name].delete_many({field: {"$in": ids}})
            db["patients"].delete_many({"_id": {"$in": ids}})
            print(f"    Pacientes con schema viejo eliminados: {len(ids)}")
            total_cleaned += len(ids)

    return total_cleaned


# ─── Reporte final ──────────────────────────────────────────────

def print_final_state(client):
    db = client[TARGET_DB]
    cols = db.list_collection_names()
    print(f"\n  {bold('Estado final de DentiaCore:')}")
    for name in sorted(cols):
        count = db[name].count_documents({})
        print(f"    {name}: {count} documentos")


# ─── Main ────────────────────────────────────────────────────────

def main():
    # Habilitar colores ANSI en Windows
    if sys.platform == "win32":
        os.system("")

    print()
    print(bold("╔══════════════════════════════════════════════════╗"))
    print(bold("║   DentiaCore — Unificador de BD Legacy           ║"))
    print(bold("╚══════════════════════════════════════════════════╝"))
    print()

    # 1. Conectar
    print(f"  Conectando a MongoDB ({MONGO_HOST})...")
    try:
        client = MongoClient(MONGO_HOST, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        print(f"  {green('Conectado ✓')}")
    except Exception as e:
        print(f"\n  {red('ERROR: No se pudo conectar a MongoDB.')}")
        print(f"  {str(e)}")
        print(f"\n  Asegúrate de que MongoDB esté ejecutándose en {MONGO_HOST}")
        input("\nPresiona Enter para salir...")
        sys.exit(1)

    separator()

    # 2. Detectar BD legacy
    print(f"\n  Buscando bases de datos legacy...")
    legacy_dbs = detect_legacy_dbs(client)

    if not legacy_dbs:
        print(f"\n  {green('No se encontraron BD legacy con datos (Dent, dental_clinic).')}")
        print(f"  La base de datos ya está unificada en «{TARGET_DB}».")

        # Aún así limpiar huérfanos si existen
        if confirm("\n  ¿Deseas verificar y limpiar datos huérfanos en DentiaCore?"):
            separator()
            print(f"\n  {bold('Limpiando datos huérfanos...')}")
            cleaned = clean_orphans(client)
            if cleaned:
                print(f"\n  {green(f'Se limpiaron {cleaned} registros huérfanos.')}")
            else:
                print(f"\n  {green('No se encontraron huérfanos. Base de datos limpia.')}")

        print_final_state(client)
        client.close()
        input("\nPresiona Enter para salir...")
        return

    # Mostrar lo encontrado
    print(f"\n  {yellow(f'Se encontraron {len(legacy_dbs)} BD legacy:')}")
    for db_info in legacy_dbs:
        print(f"    • {bold(db_info['name'])}: {db_info['total_docs']} documentos en {len(db_info['collections'])} colecciones")

    separator()

    # 3. Confirmar migración
    print(f"\n  Los datos se copiarán a → {bold(TARGET_DB)}")
    print(f"  {yellow('Documentos con el mismo _id NO se duplicarán.')}")
    if not confirm(f"\n  ¿Iniciar migración?"):
        print("  Operación cancelada.")
        client.close()
        input("\nPresiona Enter para salir...")
        return

    # 4. Migrar
    separator()
    print(f"\n  {bold('Migrando datos...')}")
    total_inserted, summary = run_migration(client, legacy_dbs)

    separator()
    print(f"\n  {bold('Resumen de migración:')}")
    if summary:
        for src, col, found, ins in summary:
            print(f"    [{src}] {col}: +{ins} nuevos (de {found} en origen)")
        print(f"\n  Total insertados: {green(str(total_inserted))}")
    else:
        print(f"  {yellow('No se insertaron documentos nuevos — todo ya existía en DentiaCore.')}")

    # 5. Limpiar huérfanos
    separator()
    print(f"\n  {bold('Limpiando datos huérfanos...')}")
    cleaned = clean_orphans(client)
    if cleaned:
        print(f"\n  {green(f'Se limpiaron {cleaned} registros huérfanos.')}")
    else:
        print(f"  {green('Sin huérfanos. Datos limpios.')}")

    # 6. Eliminar BD legacy
    separator()
    print(f"\n  {yellow('Las BD legacy originales aún existen en MongoDB.')}")
    if confirm("  ¿Deseas ELIMINAR las BD legacy (Dent, dental_clinic)?"):
        for db_info in legacy_dbs:
            db_name = db_info["name"]
            client.drop_database(db_name)
            print(f"    {green(f'«{db_name}» eliminada ✓')}")
        # También eliminar dental_clinic_test si existe
        all_dbs = [d["name"] for d in client.list_databases()]
        if "dental_clinic_test" in all_dbs:
            client.drop_database("dental_clinic_test")
            print(f"    {green('«dental_clinic_test» eliminada ✓')}")
    else:
        print("  BD legacy conservadas (puedes eliminarlas manualmente después).")

    # 7. Estado final
    print_final_state(client)
    client.close()

    separator()
    print(f"\n  {green(bold('✓ Unificación completada exitosamente.'))}")
    print(f"  Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    input("Presiona Enter para salir...")


if __name__ == "__main__":
    main()

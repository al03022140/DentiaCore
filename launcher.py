#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DentiaCore Application Launcher
Aplicación de escritorio para iniciar y detener el servidor y frontend de DentiaCore
Usa la paleta de colores del programa para mantener consistencia visual
"""

import tkinter as tk
from tkinter import ttk, messagebox
import subprocess
import threading
import os
import sys
import time
import webbrowser
from pathlib import Path

import urllib.request
import urllib.error
import shutil
import socket

class DentiaCoreLauncher:
    def __init__(self):
        # Colores del programa (extraídos de variables.css)
        self.colors = {
            'primary': '#084888',
            'primary_hover': '#025db8', 
            'primary_light': '#3498db',
            'text_primary': '#2c3e50',
            'text_secondary': '#555',
            'text_muted': '#7f8c8d',
            'text_light': '#95a5a6',
            'bg_white': '#ffffff',
            'bg_light': '#f9f9f9',
            'bg_card': '#ffffff',
            'success': '#27ae60',
            'success_hover': '#219a52',
            'warning': '#f39c12',
            'danger': '#e74c3c',
            'danger_hover': '#c0392b',
            'border_light': '#e8e8e8',
            'border_card': '#e8e8e8',
            'neutral_250': '#f8f9fb',
            'blue_500_08': '#007bff14',
            'blue_500_25': '#007bff40',
            'shadow': '#0000001a',
        }
        
        # Estado de los procesos
        self.server_process = None
        self.client_process = None
        self.mongo_process = None
        self.is_server_running = False
        self.is_client_running = False
        self.using_pm2 = False
        self.mode_lock = threading.Lock()
        
        # Directorio del proyecto
        self.project_dir = Path(__file__).parent
        
        # Crear ventana principal
        self.setup_window()

        # Variables de UI dependientes de Tk
        self.mode_var = tk.StringVar(value='local')
        self.lan_url_var = tk.StringVar(value=os.environ.get('PUBLIC_URL', 'http://localhost:5002'))
        self.current_env = os.environ.copy()
        # Directorios importantes
        self.server_dir = self.project_dir / 'Server'
        self.client_dir = self.project_dir / 'Client'
        self.db_dir = self.project_dir / 'DB'

        self.create_widgets()
        
    
        
    def setup_window(self):
        """Configurar la ventana principal"""
        self.root = tk.Tk()
        self.root.title("DentiaCore Launcher")
        self.root.geometry("540x820")
        self.root.minsize(540, 780)
        self.root.configure(bg=self.colors['bg_light'])
        self.root.resizable(False, True)

        # Cargar icono de ventana (taskbar / dock)
        self._load_icon()

        # Centrar ventana
        self.center_window()

        # Configurar cierre de ventana
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

    def _load_icon(self):
        """Asigna el icono de la app a la ventana. PNG funciona en Mac/Win/Linux con Tk 8.6+."""
        try:
            project_dir = Path(__file__).parent
            for candidate in (
                project_dir / 'Client' / 'public' / 'android-chrome-192x192.png',
                project_dir / 'Client' / 'public' / 'android-chrome-512x512.png',
            ):
                if candidate.is_file():
                    self._app_icon = tk.PhotoImage(file=str(candidate))
                    self.root.iconphoto(True, self._app_icon)
                    break
        except Exception:
            pass
        
    def center_window(self):
        """Centrar la ventana en la pantalla"""
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def _safe_popen(self, cmd, **kwargs):
        """
        Wrapper seguro para subprocess.Popen que maneja errores con CREATE_NEW_CONSOLE.
        
        En sistemas virtualizados o integrados, CREATE_NEW_CONSOLE puede fallar.
        Este método intenta con la flag, y si falla, reinenta sin ella.
        """
        if sys.platform == 'win32' and 'creationflags' not in kwargs:
            kwargs['creationflags'] = subprocess.CREATE_NEW_CONSOLE
        
        try:
            return subprocess.Popen(cmd, **kwargs)
        except (OSError, Exception) as e:
            # Si falla con CREATE_NEW_CONSOLE, intentar sin ella
            if sys.platform == 'win32' and kwargs.get('creationflags') == subprocess.CREATE_NEW_CONSOLE:
                print(f"⚠️ CREATE_NEW_CONSOLE falló ({e}), reintentar sin nueva consola...")
                kwargs.pop('creationflags', None)
                try:
                    return subprocess.Popen(cmd, **kwargs)
                except Exception as e2:
                    print(f"❌ Fallo final en Popen: {e2}")
                    raise
            else:
                raise

    # ── Helpers de UI (Design System) ──────────────────────────────

    def _create_rounded_card(self, parent, width, height, radius=16, bg='#ffffff',
                              border_color='#e8e8e8', border_width=2):
        """Crea un Canvas con un rectángulo redondeado que simula una card del design system."""
        canvas = tk.Canvas(
            parent, width=width, height=height,
            bg=parent.cget('bg'), highlightthickness=0, bd=0,
        )
        self._draw_rounded_rect(canvas, border_width, border_width,
                                 width - border_width, height - border_width,
                                 radius, fill=bg, outline=border_color, width=border_width)
        return canvas

    @staticmethod
    def _draw_rounded_rect(canvas, x1, y1, x2, y2, r, **kwargs):
        """Dibuja un rectángulo con esquinas redondeadas en un Canvas."""
        points = [
            x1 + r, y1,
            x2 - r, y1,
            x2, y1,
            x2, y1 + r,
            x2, y2 - r,
            x2, y2,
            x2 - r, y2,
            x1 + r, y2,
            x1, y2,
            x1, y2 - r,
            x1, y1 + r,
            x1, y1,
        ]
        return canvas.create_polygon(points, smooth=True, **kwargs)

    def _make_styled_button(self, parent, text, bg, fg='white', hover_bg=None,
                             font_spec=('Montserrat', 11, 'bold'), padx=24, pady=10,
                             command=None, width=None):
        """Crea un botón estilizado con efecto hover, alineado al design system."""
        hover_bg = hover_bg or bg
        btn = tk.Button(
            parent,
            text=text,
            font=font_spec,
            fg=fg,
            bg=bg,
            activebackground=hover_bg,
            activeforeground=fg,
            relief='flat',
            bd=0,
            padx=padx,
            pady=pady,
            cursor='hand2',
            command=command,
        )
        if width:
            btn.config(width=width)
        btn.bind('<Enter>', lambda e: btn.config(bg=hover_bg))
        btn.bind('<Leave>', lambda e: btn.config(bg=btn._orig_bg if hasattr(btn, '_orig_bg') else bg))
        btn._orig_bg = bg
        return btn

    def _make_outline_button(self, parent, text, command=None,
                              font_spec=('Montserrat', 9), padx=12, pady=6):
        """Crea un botón outline (borde + fondo blanco) estilo design system."""
        btn = tk.Button(
            parent,
            text=text,
            font=font_spec,
            fg=self.colors['text_primary'],
            bg=self.colors['bg_white'],
            activebackground=self.colors['border_light'],
            activeforeground=self.colors['primary'],
            relief='flat',
            bd=0,
            padx=padx,
            pady=pady,
            cursor='hand2',
            highlightthickness=1,
            highlightbackground=self.colors['border_light'],
            highlightcolor=self.colors['primary'],
            command=command,
        )
        btn.bind('<Enter>', lambda e: btn.config(bg=self.colors['blue_500_08'],
                                                   fg=self.colors['primary']))
        btn.bind('<Leave>', lambda e: btn.config(bg=self.colors['bg_white'],
                                                   fg=self.colors['text_primary']))
        return btn

    def _make_section_title(self, parent, text, color=None):
        """Crea un label de título de sección con el color primario del design system."""
        color = color or self.colors['primary']
        return tk.Label(
            parent, text=text,
            font=('Montserrat', 11), fg=color,
            bg=parent.cget('bg'), anchor='w',
        )

    def _create_status_badge(self, parent, width=130, height=26):
        """Crea un badge tipo pill (Canvas con rectángulo redondeado)."""
        canvas = tk.Canvas(
            parent, width=width, height=height,
            bg=parent.cget('bg'), highlightthickness=0, bd=0,
        )
        canvas._badge_width = width
        canvas._badge_height = height
        canvas._badge_radius = height // 2
        return canvas

    def _update_status_badge(self, canvas, text, bg_color, fg_color='white'):
        """Actualiza el contenido de un badge creado con _create_status_badge."""
        try:
            canvas.delete('all')
            w, h, r = canvas._badge_width, canvas._badge_height, canvas._badge_radius
            self._draw_rounded_rect(
                canvas, 1, 1, w - 1, h - 1, r,
                fill=bg_color, outline=bg_color,
            )
            canvas.create_text(
                w // 2, h // 2,
                text=text, font=('Montserrat', 9, 'bold'), fill=fg_color,
            )
        except tk.TclError:
            pass

    def _start_spinner(self, widget, base_text):
        """Inicia un spinner animado en un widget tipo Button mientras opera asíncronamente."""
        if not hasattr(self, '_spinner_jobs'):
            self._spinner_jobs = {}
        self._stop_spinner(widget)
        frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        state = {'idx': 0}

        def tick():
            try:
                widget.config(text=f'{frames[state["idx"] % len(frames)]}  {base_text}')
            except tk.TclError:
                return
            state['idx'] += 1
            self._spinner_jobs[widget] = self.root.after(90, tick)

        tick()

    def _stop_spinner(self, widget):
        """Detiene un spinner previamente iniciado en el widget."""
        if not hasattr(self, '_spinner_jobs'):
            return
        job = self._spinner_jobs.pop(widget, None)
        if job:
            try:
                self.root.after_cancel(job)
            except tk.TclError:
                pass

    # ── Layout principal ──────────────────────────────────────────

    def create_widgets(self):
        """Crear todos los widgets de la interfaz — Design System DentiaCore"""
        C = self.colors  # alias

        outer = tk.Frame(self.root, bg=C['bg_light'])
        outer.pack(fill='both', expand=True)

        # ── Brand header strip (full width, color corporativo) ──
        brand_bar = tk.Frame(outer, bg=C['primary'], height=82)
        brand_bar.pack(fill='x', side='top')
        brand_bar.pack_propagate(False)

        brand_accent = tk.Frame(outer, bg=C['primary_light'], height=3)
        brand_accent.pack(fill='x', side='top')

        brand_inner = tk.Frame(brand_bar, bg=C['primary'])
        brand_inner.pack(fill='both', expand=True, padx=24, pady=14)

        tk.Label(
            brand_inner, text='🦷', font=('Segoe UI Emoji', 30),
            bg=C['primary'], fg='white',
        ).pack(side='left', padx=(0, 12))

        title_block = tk.Frame(brand_inner, bg=C['primary'])
        title_block.pack(side='left')
        tk.Label(
            title_block, text='DentiaCore',
            font=('Montserrat', 20, 'bold'), fg='white', bg=C['primary'],
        ).pack(anchor='w')
        tk.Label(
            title_block, text='Sistema de Gestión Dental',
            font=('Montserrat', 10), fg='#cfe1f5', bg=C['primary'],
        ).pack(anchor='w')

        # Version chip a la derecha del brand bar
        version_chip = tk.Frame(brand_inner, bg='white')
        version_chip.pack(side='right')
        tk.Label(
            version_chip, text=' v1.0 ',
            font=('Montserrat', 9, 'bold'), fg=C['primary'], bg='white',
            padx=4, pady=2,
        ).pack(padx=2, pady=2)

        # Área principal con padding
        main_frame = tk.Frame(outer, bg=C['bg_light'], padx=28, pady=20)
        main_frame.pack(fill='both', expand=True)

        # ── Card: Estado de Servicios ──
        status_card = tk.Frame(main_frame, bg=C['bg_card'], bd=0,
                                highlightthickness=2, highlightbackground=C['border_card'],
                                highlightcolor=C['border_card'])
        status_card.pack(fill='x', pady=(0, 16), ipady=12, ipadx=16)

        self._make_section_title(status_card, 'Estado de Servicios').pack(
            anchor='w', padx=16, pady=(10, 8))

        sep = tk.Frame(status_card, height=1, bg=C['border_light'])
        sep.pack(fill='x', padx=16, pady=(0, 8))

        # Server row: label izq + badge der
        srv_row = tk.Frame(status_card, bg=C['bg_card'])
        srv_row.pack(fill='x', padx=16, pady=4)
        tk.Label(
            srv_row, text='Servidor backend',
            font=('Montserrat', 10), fg=C['text_primary'], bg=C['bg_card'],
        ).pack(side='left')
        self.server_status = self._create_status_badge(srv_row)
        self.server_status.pack(side='right')
        self._update_status_badge(self.server_status, 'DETENIDO', C['text_light'])

        # Frontend row
        fe_row = tk.Frame(status_card, bg=C['bg_card'])
        fe_row.pack(fill='x', padx=16, pady=4)
        tk.Label(
            fe_row, text='Frontend (cliente)',
            font=('Montserrat', 10), fg=C['text_primary'], bg=C['bg_card'],
        ).pack(side='left')
        self.client_status = self._create_status_badge(fe_row)
        self.client_status.pack(side='right')
        self._update_status_badge(self.client_status, 'DETENIDO', C['text_light'])

        # ── Card: Modo de despliegue ──
        mode_card = tk.Frame(main_frame, bg=C['bg_card'], bd=0,
                              highlightthickness=2, highlightbackground=C['border_card'],
                              highlightcolor=C['border_card'])
        mode_card.pack(fill='x', pady=(0, 16), ipady=12, ipadx=16)

        self._make_section_title(mode_card, 'Modo de despliegue').pack(
            anchor='w', padx=16, pady=(10, 8))

        sep2 = tk.Frame(mode_card, height=1, bg=C['border_light'])
        sep2.pack(fill='x', padx=16, pady=(0, 10))

        radio_frame = tk.Frame(mode_card, bg=C['bg_card'])
        radio_frame.pack(anchor='w', padx=16, pady=(0, 6))

        for txt, val in [('Local', 'local'), ('LAN', 'lan')]:
            tk.Radiobutton(
                radio_frame, text=txt, variable=self.mode_var, value=val,
                font=('Montserrat', 10), bg=C['bg_card'],
                activebackground=C['bg_card'], selectcolor=C['bg_card'],
                fg=C['text_primary'], indicatoron=True, command=self.update_mode,
            ).pack(side='left', padx=(0, 16))

        lan_inner = tk.Frame(mode_card, bg=C['bg_card'])
        lan_inner.pack(fill='x', padx=16, pady=(4, 8))

        self.lan_label = tk.Label(
            lan_inner, text='URL pública (LAN):',
            font=('Montserrat', 9), fg=C['text_muted'], bg=C['bg_card'],
        )
        self.lan_label.pack(anchor='w')

        self.lan_entry = tk.Entry(
            lan_inner, textvariable=self.lan_url_var,
            font=('Montserrat', 9), relief='flat', bd=0,
            bg=C['neutral_250'],
            highlightthickness=1, highlightbackground=C['border_light'],
            highlightcolor=C['primary'],
        )
        self.lan_entry.pack(fill='x', pady=(4, 0), ipady=6)

        # ── Botones principales ──
        btns_frame = tk.Frame(main_frame, bg=C['bg_light'])
        btns_frame.pack(fill='x', pady=(0, 10))

        self.start_all_btn = self._make_styled_button(
            btns_frame, text='▶   Iniciar Aplicación Completa',
            bg=C['primary'], hover_bg=C['primary_hover'],
            font_spec=('Montserrat', 12, 'bold'), pady=13,
            command=self.start_all,
        )
        self.start_all_btn.pack(fill='x', pady=(0, 8))

        self.stop_all_btn = self._make_styled_button(
            btns_frame, text='■   Detener Todo',
            bg=C['danger'], hover_bg=C['danger_hover'],
            font_spec=('Montserrat', 12, 'bold'), pady=13,
            command=self.stop_all,
        )
        self.stop_all_btn.pack(fill='x')

        # ── Card: Controles Individuales ──
        ctrl_card = tk.Frame(main_frame, bg=C['bg_card'], bd=0,
                              highlightthickness=2, highlightbackground=C['border_card'],
                              highlightcolor=C['border_card'])
        ctrl_card.pack(fill='x', pady=(16, 16), ipady=12, ipadx=16)

        self._make_section_title(ctrl_card, 'Controles Individuales').pack(
            anchor='w', padx=16, pady=(10, 8))

        sep3 = tk.Frame(ctrl_card, height=1, bg=C['border_light'])
        sep3.pack(fill='x', padx=16, pady=(0, 12))

        grid_frame = tk.Frame(ctrl_card, bg=C['bg_card'])
        grid_frame.pack(padx=16, pady=(0, 8))

        self.server_btn = self._make_styled_button(
            grid_frame, text='▶   Servidor',
            bg=C['primary_light'], hover_bg=C['primary'],
            font_spec=('Montserrat', 10, 'bold'), padx=18, pady=9,
            command=self.toggle_server,
        )
        self.server_btn.grid(row=0, column=0, padx=(0, 8), sticky='ew')

        self.client_btn = self._make_styled_button(
            grid_frame, text='▶   Frontend',
            bg=C['primary_light'], hover_bg=C['primary'],
            font_spec=('Montserrat', 10, 'bold'), padx=18, pady=9,
            command=self.toggle_client,
        )
        self.client_btn.grid(row=0, column=1, padx=(8, 0), sticky='ew')

        grid_frame.columnconfigure(0, weight=1)
        grid_frame.columnconfigure(1, weight=1)

        # ── Card: Accesos Rápidos ──
        quick_card = tk.Frame(main_frame, bg=C['bg_card'], bd=0,
                               highlightthickness=2, highlightbackground=C['border_card'],
                               highlightcolor=C['border_card'])
        quick_card.pack(fill='x', pady=(0, 8), ipady=12, ipadx=16)

        self._make_section_title(quick_card, 'Accesos Rápidos').pack(
            anchor='w', padx=16, pady=(10, 8))

        sep4 = tk.Frame(quick_card, height=1, bg=C['border_light'])
        sep4.pack(fill='x', padx=16, pady=(0, 12))

        qbtns = tk.Frame(quick_card, bg=C['bg_card'])
        qbtns.pack(padx=16, pady=(0, 8))

        self._make_outline_button(qbtns, '↗   Abrir en navegador', command=self.open_app).grid(
            row=0, column=0, padx=(0, 6))
        self._make_outline_button(qbtns, '✕   Limpiar pacientes', command=self.clear_patients).grid(
            row=0, column=1, padx=6)
        self._make_outline_button(qbtns, '⊕   Abrir carpeta', command=self.open_folder).grid(
            row=0, column=2, padx=(6, 0))

        # ── Footer ──
        tk.Label(
            main_frame, text='DentiaCore  ·  v1.0  ·  © 2026 Sistema de Gestión Dental',
            font=('Montserrat', 8), fg=C['text_light'], bg=C['bg_light'],
        ).pack(pady=(12, 0))

        # Actualizar estado inicial
        self.update_ui_state()
        self.update_mode()
        
    def start_all(self):
        """Iniciar servidor y frontend"""
        if not self.is_server_running and not self.is_client_running:
            self.start_all_btn.config(state='disabled')
            self._start_spinner(self.start_all_btn, 'Iniciando...')
            threading.Thread(target=self._start_all_thread, daemon=True).start()
        
    def _start_all_thread(self):
        """Hilo para iniciar todos los servicios"""
        try:
            # VERIFICACIONES PREVIAS AL INICIO
            print("🚀 Iniciando verificaciones del sistema...")
            
            # 1. Verificar todos los requisitos del sistema
            requirements_ok, requirements_error = self._verify_system_requirements()
            if not requirements_ok:
                self.root.after(0, lambda: messagebox.showerror(
                    "Requisitos del Sistema",
                    f"No se pueden iniciar los servicios:\n\n{requirements_error}"
                ))
                return
            
            # Matar puertos antes de iniciar (ya verificados en _verify_system_requirements)
            self._kill_port(5002)  # Puerto del servidor
            self._kill_port(5173)  # Puerto del cliente Vite
            self._kill_port(5174)  # Puerto alternativo del cliente
            time.sleep(1)  # Esperar a que los puertos se liberen
            
            env = self._apply_mode_environment()

            mode = env.get('DENT_MODE', 'local')
            if mode == 'lan':
                # Asegurar MongoDB ejecutándose y listo
                if not self._ensure_mongo_running():
                    self.root.after(0, lambda: messagebox.showerror(
                        'MongoDB no disponible',
                        'No se pudo verificar que MongoDB esté listo en el puerto 27017.\n\n'
                        'Por favor, inicia el servicio de MongoDB y vuelve a intentar.'
                    ))
                    return
                # Asegurar build del cliente para servir estáticos
                self._ensure_client_build()
                started = self._start_server_with_pm2(env)
                if not started:
                    self.server_process = self._safe_popen(
                        ['npm', 'run', 'start'],
                        shell=(sys.platform == 'win32'),
                        cwd=self.server_dir,
                        env=env
                    )
                    self.using_pm2 = False
                target_url = env.get('PUBLIC_URL', 'http://localhost:5002')
                self.is_server_running = self._wait_for_server_ready(target_url, timeout=30)
                self.is_client_running = False
                if self.is_server_running:
                    # En LAN, el server sirve el cliente buildeado en el mismo puerto
                    self.root.after(500, lambda: self._auto_open_browser(target_url))
                if not self.is_server_running:
                    self.root.after(0, lambda: messagebox.showerror(
                        "Servidor no disponible",
                        f"No se pudo verificar el servidor en {target_url}/api/health.\n\n"
                        "Revisa que MongoDB esté corriendo y que el puerto 5002 esté accesible en la red (firewall)."
                    ))
            else:
                # modo local: iniciar servidor primero, luego cliente
                print("🔄 Iniciando en modo local...")
                
                # 1. Iniciar MongoDB
                if not self._ensure_mongo_running():
                    self.root.after(0, lambda: messagebox.showerror(
                        'MongoDB no disponible',
                        'No se pudo verificar que MongoDB esté listo en el puerto 27017.\n\n'
                        'Por favor, inicia el servicio de MongoDB y vuelve a intentar.'
                    ))
                    return
                
                # 2. Iniciar solo el servidor primero
                print("🔄 Iniciando servidor backend...")
                self.server_process = self._safe_popen(
                    ['npm', 'run', 'dev'],
                    shell=(sys.platform == 'win32'),
                    cwd=self.server_dir,
                    env=env
                )
                self.using_pm2 = False
                
                # 3. Esperar a que el servidor esté completamente listo
                target_url = env.get('PUBLIC_URL', 'http://localhost:5002')
                self.is_server_running = self._wait_for_server_ready(target_url, timeout=60, process=self.server_process)
                
                if self.is_server_running:
                    # 4. Solo si el servidor está listo, iniciar el cliente
                    print("🔄 Servidor listo, iniciando cliente frontend...")
                    time.sleep(2)  # Pequeña pausa adicional para asegurar estabilidad
                    self.client_process = self._safe_popen(
                        ['npm', 'run', 'client'],
                        shell=(sys.platform == 'win32'),
                        cwd=self.project_dir,
                        env=env
                    )
                    # Dar tiempo al cliente para iniciar
                    time.sleep(5)
                    self.is_client_running = True
                    print("✅ Aplicación iniciada correctamente")
                    # Auto-abrir el browser para que el usuario no tenga que clickear
                    self.root.after(500, lambda: self._auto_open_browser('http://localhost:5173'))
                else:
                    self.is_client_running = False
                    # Si el servidor no inicia, mostrar error específico
                    self.root.after(0, lambda: messagebox.showerror(
                        "Error de Servidor",
                        f"El servidor no pudo iniciarse en {target_url}.\n\n"
                        "Verifica que:\n"
                        "1. MongoDB esté ejecutándose\n"
                        "2. El puerto 5002 esté disponible\n"
                        "3. Las dependencias estén instaladas (npm install)"
                    ))
            
        except Exception as e:
            error_msg = f"Error al iniciar: {str(e)}\n\nAsegurate de:\n1. Tener MongoDB ejecutandose\n2. Haber instalado dependencias (npm install)\n3. No tener otros servicios en los puertos 5002, 5173, 5174"
            print(f"❌ Error en _start_all_thread: {error_msg}")
            
            # Limpiar procesos si hay error
            if hasattr(self, 'server_process') and self.server_process:
                try:
                    self.server_process.terminate()
                except:
                    pass
                self.server_process = None
                
            if hasattr(self, 'client_process') and self.client_process:
                try:
                    self.client_process.terminate()
                except:
                    pass
                self.client_process = None
                
            self.is_server_running = False
            self.is_client_running = False
            
            self.root.after(0, lambda: messagebox.showerror("Error al Iniciar", error_msg))
        finally:
            # Asegurar que la UI se actualice incluso si hubo retornos tempranos
            self.root.after(0, self.update_ui_state)
            
    def stop_all(self):
        """Detener todos los servicios"""
        self.stop_all_btn.config(state='disabled')
        self._start_spinner(self.stop_all_btn, 'Deteniendo...')
        threading.Thread(target=self._stop_all_thread, daemon=True).start()
        
    def _stop_all_thread(self):
        """Hilo para detener todos los servicios"""
        try:
            if self.using_pm2:
                subprocess.run(['pm2', 'stop', 'dentiacore-api'], shell=(sys.platform == 'win32'), cwd=self.server_dir, env=self.current_env, capture_output=True)
                subprocess.run(['pm2', 'delete', 'dentiacore-api'], shell=(sys.platform == 'win32'), cwd=self.server_dir, env=self.current_env, capture_output=True)
                self.using_pm2 = False

            # Terminar procesos si existen (cliente primero, luego servidor)
            if self.client_process:
                try:
                    self.client_process.terminate()
                    time.sleep(1)  # Dar tiempo para terminar graciosamente
                    if self.client_process.poll() is None:
                        self.client_process.kill()
                except Exception:
                    pass
                self.client_process = None
                
            if self.server_process:
                try:
                    self.server_process.terminate()
                    time.sleep(2)  # Dar más tiempo al servidor para cerrar conexiones
                    if self.server_process.poll() is None:
                        self.server_process.kill()
                except Exception:
                    pass
                self.server_process = None
                
            if self.mongo_process:
                try:
                    self.mongo_process.terminate()
                except Exception:
                    pass
                self.mongo_process = None
                
            # Matar puertos específicos como respaldo
            self._kill_port(5173)
            self._kill_port(5174)
            self._kill_port(5002)
            
            self.is_server_running = False
            self.is_client_running = False
            
            # Actualizar UI en el hilo principal
            self.root.after(0, self.update_ui_state)
            
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Error", f"Error al detener: {str(e)}"))
            self.root.after(0, self.update_ui_state)
            
    def toggle_server(self):
        """Alternar estado del servidor"""
        if self.is_server_running:
            self.stop_server()
        else:
            self.start_server()
            
    def toggle_client(self):
        """Alternar estado del frontend"""
        if self.is_client_running:
            self.stop_client()
        else:
            self.start_client()

    def _check_npm_dependencies(self):
        """Verificar que las dependencias npm estén instaladas"""
        try:
            print("🔍 Verificando dependencias npm...")
            
            # Verificar node_modules en el directorio raíz
            root_node_modules = os.path.join(self.project_dir, 'node_modules')
            if not os.path.exists(root_node_modules):
                print("❌ node_modules no encontrado en directorio raíz")
                return False, "Dependencias del proyecto raíz no instaladas"
            
            # Verificar node_modules en Server
            server_node_modules = os.path.join(self.server_dir, 'node_modules')
            if not os.path.exists(server_node_modules):
                print("❌ node_modules no encontrado en Server")
                return False, "Dependencias del servidor no instaladas"
            
            # Verificar node_modules en Client
            client_node_modules = os.path.join(self.client_dir, 'node_modules')
            if not os.path.exists(client_node_modules):
                print("❌ node_modules no encontrado en Client")
                return False, "Dependencias del cliente no instaladas"
            
            # Verificar dependencias críticas
            critical_deps = [
                (self.project_dir, ['concurrently', 'nodemon']),
                (self.server_dir, ['express', 'mongoose', 'dotenv']),
                (self.client_dir, ['react', 'vite'])
            ]
            
            for dir_path, deps in critical_deps:
                for dep in deps:
                    dep_path = os.path.join(dir_path, 'node_modules', dep)
                    if not os.path.exists(dep_path):
                        print(f"❌ Dependencia crítica '{dep}' no encontrada en {os.path.basename(dir_path)}")
                        return False, f"Dependencia crítica '{dep}' faltante en {os.path.basename(dir_path)}"
            
            print("✅ Todas las dependencias npm verificadas correctamente")
            return True, None
            
        except Exception as e:
            print(f"❌ Error verificando dependencias: {str(e)}")
            return False, f"Error verificando dependencias: {str(e)}"

    def _check_port_availability(self, port):
        """Verificar si un puerto está disponible"""
        try:
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                result = s.connect_ex(('localhost', port))
                return result != 0  # True si el puerto está libre
        except Exception:
            return False
            
    def _kill_port(self, port):
        """Matar proceso en un puerto específico antes de iniciar un servicio"""
        try:
            if sys.platform != 'win32':
                # On macOS/Linux: try lsof first, fallback to ps
                try:
                    result = subprocess.run(
                        ['lsof', '-ti', f':{port}'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.stdout.strip():
                        for pid in result.stdout.strip().split('\n'):
                            if pid.strip():
                                subprocess.run(['kill', '-9', pid.strip()], capture_output=True, timeout=5)
                except FileNotFoundError:
                    # lsof not available, fallback to netstat
                    try:
                        result = subprocess.run(
                            ['netstat', '-tulpn'],
                            capture_output=True, text=True, timeout=5
                        )
                        for line in result.stdout.split('\n'):
                            if f':{port}' in line:
                                # Extract PID and kill it
                                parts = line.split()
                                if len(parts) >= 7:
                                    try:
                                        pid = parts[-1].split('/')[0]
                                        if pid.isdigit():
                                            subprocess.run(['kill', '-9', pid], capture_output=True, timeout=5)
                                    except:
                                        pass
                    except:
                        pass
            else:
                # Windows: use taskkill (built-in) instead of npx kill-port
                # First, find PID using netstat
                try:
                    result = subprocess.run(
                        ['netstat', '-ano'],
                        shell=True,
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    for line in result.stdout.split('\n'):
                        if f':{port}' in line and 'LISTENING' in line:
                            parts = line.split()
                            if parts:
                                pid = parts[-1].strip()
                                if pid.isdigit():
                                    subprocess.run(
                                        ['taskkill', '/F', '/PID', pid],
                                        shell=True,
                                        capture_output=True,
                                        timeout=5
                                    )
                except Exception:
                    # Fallback: try npx if available
                    try:
                        subprocess.run(
                            ['npx', 'kill-port', str(port)],
                            shell=True,
                            capture_output=True,
                            timeout=5
                        )
                    except:
                        pass
        except Exception:
            pass  # Ignorar errores si el puerto ya está libre

    def _install_missing_dependencies(self):
        """Intenta instalar las dependencias faltantes automáticamente."""
        try:
            print("🔄 Instalando dependencias faltantes...")
            
            # Instalar en raíz
            print("📦 Instalando dependencias en raíz...")
            subprocess.run(['npm', 'install'], cwd=self.project_dir, shell=(sys.platform == 'win32'), check=True)

            # Instalar en Server
            print("📦 Instalando dependencias en Server...")
            subprocess.run(['npm', 'install'], cwd=self.server_dir, shell=(sys.platform == 'win32'), check=True)

            # Instalar en Client
            print("📦 Instalando dependencias en Client...")
            subprocess.run(['npm', 'install'], cwd=self.client_dir, shell=(sys.platform == 'win32'), check=True)
            
            return True
        except subprocess.CalledProcessError as e:
            print(f"❌ Error instalando dependencias: {e}")
            return False
        except Exception as e:
            print(f"❌ Error inesperado instalando dependencias: {e}")
            return False

    def _verify_system_requirements(self):
        """Verificar todos los requisitos del sistema antes de iniciar"""
        try:
            print("🔍 Verificando requisitos del sistema...")
            
            # 1. Verificar dependencias npm
            deps_ok, deps_error = self._check_npm_dependencies()
            if not deps_ok:
                print("⚠️ Faltan dependencias, intentando instalar automáticamente...")
                if self._install_missing_dependencies():
                     print("✅ Dependencias instaladas correctamente.")
                else:
                     return False, f"Dependencias npm: {deps_error}\n\nEjecuta: npm install"
            
            # 2. Verificar puertos disponibles
            ports_to_check = [5002, 5173, 5174]
            busy_ports = []
            
            for port in ports_to_check:
                if not self._check_port_availability(port):
                    busy_ports.append(port)
            
            if busy_ports:
                print(f"⚠️ Puertos ocupados: {busy_ports}")
                # Intentar liberar puertos
                for port in busy_ports:
                    print(f"🔄 Intentando liberar puerto {port}...")
                    self._kill_port(port)
                
                # Verificar nuevamente después de intentar liberar
                time.sleep(2)
                still_busy = []
                for port in busy_ports:
                    if not self._check_port_availability(port):
                        still_busy.append(port)
                
                if still_busy:
                    return False, f"Puertos aún ocupados: {still_busy}\n\nCierra las aplicaciones que usan estos puertos"
            
            # 3. Verificar MongoDB (solo advertencia, no bloquear)
            mongo_running = self._check_mongodb_status()
            if not mongo_running:
                print("⚠️ MongoDB no está ejecutándose, se intentará iniciar automáticamente")
            
            print("✅ Todos los requisitos del sistema verificados")
            return True, None
            
        except Exception as e:
            error_msg = f"Error verificando requisitos: {str(e)}"
            print(f"❌ {error_msg}")
            return False, error_msg

    def _check_mongodb_status(self):
        """Verificar si MongoDB está ejecutándose (multiplataforma)"""
        try:
            if sys.platform == 'win32':
                result = subprocess.run(
                    ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return 'mongod.exe' in (result.stdout or '')
            else:
                # Para macOS/Linux usar pgrep
                result = subprocess.run(
                    ['pgrep', '-f', 'mongod'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                return result.returncode == 0
        except Exception:
            return False

    def _apply_mode_environment(self):
        """Configurar variables de entorno según el modo seleccionado"""
        with self.mode_lock:
            mode = self.mode_var.get()
        public_url = self.lan_url_var.get().strip() or 'http://localhost:5002'

        env_vars = os.environ.copy()
        env_vars['DENT_MODE'] = mode
        env_vars['PUBLIC_URL'] = public_url if mode == 'lan' else 'http://localhost:5002'
        
        # CLIENT_URL debe apuntar al frontend, no al backend
        if mode == 'lan':
            # En modo LAN, el frontend se sirve desde el backend
            env_vars['CLIENT_URL'] = env_vars['PUBLIC_URL']
        else:
            # En modo local/desarrollo, el frontend está en Vite dev server
            env_vars['CLIENT_URL'] = 'http://localhost:5173'

        # Propagar VITE_API_URL al build del frontend y al dev server
        env_vars['VITE_API_URL'] = env_vars['PUBLIC_URL'] if mode == 'lan' else 'http://localhost:5002'
        
        env_vars['HOST'] = '0.0.0.0' if mode == 'lan' else '127.0.0.1'
        # Asegurar puerto permitido por el servidor (5002 por defecto)
        env_vars.setdefault('PORT', '5002')
        # Asegurar NODE_ENV
        env_vars.setdefault('NODE_ENV', 'development' if mode == 'local' else 'production')
        
        # Asegurar MONGODB_URI por defecto si no existe
        if 'MONGODB_URI' not in env_vars:
             # Intentar leer del .env del servidor para ver si está ahí
             server_env = self._parse_env_file(str(self.server_dir / '.env'))
             if 'MONGODB_URI' in server_env:
                 env_vars['MONGODB_URI'] = server_env['MONGODB_URI']
             else:
                 # Valor por defecto seguro
                 env_vars['MONGODB_URI'] = 'mongodb://127.0.0.1:27017/DentiaCore'

        self.current_env = env_vars
        return env_vars

    def _parse_env_file(self, file_path):
        """Lee un archivo .env simple y devuelve un dict con las variables.

        No realiza interpolación, solo pares KEY=VALUE. Ignora líneas vacías y comentarios.
        """
        env = {}
        try:
            if not os.path.exists(file_path):
                return env
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#'):
                        continue
                    if '=' not in line:
                        continue
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    env[key] = value
        except Exception as e:
            print(f"⚠️ No se pudo leer {file_path}: {e}")
        return env

    def _print_effective_configuration(self, env):
        """Imprime un resumen de la configuración efectiva usada para iniciar los servicios."""
        server_env = self._parse_env_file(str(self.server_dir / '.env'))
        client_env = self._parse_env_file(str(self.client_dir / '.env'))

        print("\nℹ️ Configuración efectiva (launcher):")
        print(f"  • DENT_MODE = {env.get('DENT_MODE')}")
        print(f"  • PUBLIC_URL = {env.get('PUBLIC_URL')}")
        print(f"  • CLIENT_URL = {env.get('CLIENT_URL')}")
        print(f"  • VITE_API_URL = {env.get('VITE_API_URL')}")
        print(f"  • HOST = {env.get('HOST')}")
        print(f"  • PORT = {env.get('PORT')}\n")

        print("🧩 Variables en Server/.env (ref):")
        print(f"  • MONGODB_URI = {server_env.get('MONGODB_URI')}")
        print(f"  • PORT = {server_env.get('PORT')}")
        print(f"  • HOST = {server_env.get('HOST')}")
        print(f"  • CLIENT_URL = {server_env.get('CLIENT_URL')}")
        print(f"  • API_URL = {server_env.get('API_URL')}\n")

        print("🧩 Variables en Client/.env (ref):")
        print(f"  • VITE_API_URL = {client_env.get('VITE_API_URL')}\n")

    def _validate_envs(self, env):
        """Valida variables críticas y muestra advertencias útiles.

        No bloquea el arranque; devuelve una lista de advertencias para diagnóstico.
        """
        warnings = []
        server_env = self._parse_env_file(str(self.server_dir / '.env'))
        client_env = self._parse_env_file(str(self.client_dir / '.env'))

        mode = env.get('DENT_MODE', 'local')

        # Validación de MongoDB
        mongo_uri = server_env.get('MONGODB_URI')
        if not mongo_uri:
            warnings.append("Server/.env no define MONGODB_URI; se requiere para conectar a MongoDB.")
        else:
            if 'mongodb://' not in mongo_uri:
                warnings.append("MONGODB_URI parece inválida (no comienza con mongodb://).")

        # Puerto del servidor
        port = env.get('PORT') or server_env.get('PORT')
        if str(port) != '5002':
            warnings.append("El puerto efectivo del servidor no es 5002; verifica compatibilidad de scripts y CORS/CSP.")

        # CLIENT_URL y VITE_API_URL coherentes
        if mode == 'local':
            if env.get('CLIENT_URL') != 'http://localhost:5173':
                warnings.append("CLIENT_URL debería ser http://localhost:5173 en modo local.")
            vite_api = client_env.get('VITE_API_URL')
            if vite_api and vite_api != 'http://localhost:5002':
                warnings.append("Client/.env VITE_API_URL debería apuntar a http://localhost:5002 en modo local.")
        else:  # lan
            if env.get('HOST') != '0.0.0.0':
                warnings.append("En modo LAN, HOST debería ser 0.0.0.0 para aceptar conexiones de red.")

        if warnings:
            print("⚠️ Advertencias de configuración:")
            for w in warnings:
                print(f"  - {w}")
        else:
            print("✅ Variables de entorno críticas validadas")
        return warnings

    def update_mode(self):
        """Actualizar controles según el modo seleccionado"""
        is_lan = self.mode_var.get() == 'lan'
        if is_lan and not self.lan_url_var.get().strip():
            self.lan_url_var.set('http://localhost:5002')

        if hasattr(self, 'lan_entry'):
            self.lan_entry.config(state='normal' if is_lan else 'disabled',
                                   bg=self.colors['neutral_250'] if is_lan else self.colors['border_light'])
        if hasattr(self, 'lan_label'):
            self.lan_label.config(fg=self.colors['text_primary'] if is_lan else self.colors['text_light'])
        if hasattr(self, 'client_btn'):
            state = 'disabled' if is_lan else 'normal'
            self.client_btn.config(state=state)
        self.update_ui_state()

    def _start_server_with_pm2(self, env):
        server_dir = self.server_dir
        try:
            # Comprobar si ya existe la app en PM2
            exists = subprocess.run(
                ['pm2', 'describe', 'dentiacore-api'],
                shell=(sys.platform == 'win32'),
                cwd=server_dir,
                env=env,
                capture_output=True
            )
            if exists.returncode == 0 and b"status" in exists.stdout.lower():
                # Reiniciar actualizando variables de entorno del demonio
                subprocess.run(
                    ['pm2', 'restart', 'dentiacore-api', '--update-env'],
                    shell=(sys.platform == 'win32'),
                    cwd=server_dir,
                    env=env,
                    check=True
                )
            else:
                subprocess.run(
                    ['pm2', 'start', 'ecosystem.config.cjs', '--only', 'dentiacore-api', '--update-env'],
                    shell=(sys.platform == 'win32'),
                    cwd=server_dir,
                    env=env,
                    check=True
                )
            self.server_process = None
            self.using_pm2 = True
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
            
    def start_server(self):
        """Iniciar solo el servidor"""
        threading.Thread(target=self._start_server_thread, daemon=True).start()
        
    def _start_server_thread(self):
        """Hilo para iniciar el servidor"""
        try:
            # Matar puerto del servidor antes de iniciar
            self._kill_port(5002)
            time.sleep(1)
            
            server_dir = self.server_dir
            env = self._apply_mode_environment()
            mode = env.get('DENT_MODE', 'local')

            # Validación y resumen de configuración efectiva
            self._print_effective_configuration(env)
            self._validate_envs(env)

            if mode == 'lan':
                # Asegurar servicios previos
                if not self._ensure_mongo_running():
                    self.root.after(0, lambda: messagebox.showerror(
                        'MongoDB no disponible',
                        'No se pudo verificar que MongoDB esté listo en el puerto 27017.\n\n'
                        'Por favor, inicia el servicio de MongoDB y vuelve a intentar.'
                    ))
                    return
                self._ensure_client_build()
                started = self._start_server_with_pm2(env)
                if not started:
                    self.server_process = self._safe_popen(
                        ['npm', 'run', 'start'],
                        shell=(sys.platform == 'win32'),
                        cwd=server_dir,
                        env=env
                    )
                    self.using_pm2 = False
            else:
                # modo local -> servidor en desarrollo
                if not self._ensure_mongo_running():
                    self.root.after(0, lambda: messagebox.showerror(
                        'MongoDB no disponible',
                        'No se pudo verificar que MongoDB esté listo en el puerto 27017.\n\n'
                        'Por favor, inicia el servicio de MongoDB y vuelve a intentar.'
                    ))
                    return
                self.server_process = self._safe_popen(
                    ['npm', 'run', 'dev'],
                    shell=(sys.platform == 'win32'),
                    cwd=server_dir,
                    env=env
                )
                self.using_pm2 = False
            
            # Esperar a que el servidor esté listo respondiendo /api/health
            target_url = env.get('PUBLIC_URL', 'http://localhost:5002')
            if self._wait_for_server_ready(target_url, timeout=45, process=self.server_process if not self.using_pm2 else None):
                self.is_server_running = True
            else:
                self.is_server_running = False
                eff_host = env.get('HOST')
                eff_port = env.get('PORT')
                server_env = self._parse_env_file(str(self.server_dir / '.env'))
                mongodb_uri = server_env.get('MONGODB_URI')
                vite_api_url = self._parse_env_file(str(self.client_dir / '.env')).get('VITE_API_URL')
                msg = (
                    f"No se pudo verificar el servidor en {target_url}/api/health.\n\n"
                    "Posibles causas:\n"
                    "• MongoDB no está corriendo o la cadena MONGODB_URI es inválida.\n"
                    "• El puerto 5002 está bloqueado por el firewall o en uso.\n"
                    "• El proceso del servidor se cerró con un error.\n\n"
                    "Sugerencias:\n"
                    "1) Abre 'Server/logs' para ver errores.\n"
                    "2) Verifica que 'PORT=5002' esté libre.\n"
                    "3) Confirma que el .env del servidor tiene MONGODB_URI correcta.\n\n"
                    "Variables actuales:\n"
                    f"• DENT_MODE={mode}\n"
                    f"• HOST={eff_host}  PORT={eff_port}\n"
                    f"• PUBLIC_URL={env.get('PUBLIC_URL')}\n"
                    f"• CLIENT_URL={env.get('CLIENT_URL')}\n"
                    f"• VITE_API_URL (Client/.env)={vite_api_url}\n"
                    f"• MONGODB_URI (Server/.env)={mongodb_uri}\n"
                )
                self.root.after(0, lambda: messagebox.showerror("Servidor no disponible", msg))

        except Exception as e:
            error_msg = f"Error al iniciar servidor: {str(e)}\n\nVerifica:\n1. MongoDB esta corriendo\n2. El puerto 5002 esta libre\n3. Dependencias instaladas"
            self.root.after(0, lambda: messagebox.showerror("Error Servidor", error_msg))
        finally:
            self.root.after(0, self.update_ui_state)
            
    def stop_server(self):
        """Detener solo el servidor"""
        if self.using_pm2:
            subprocess.run(['pm2', 'stop', 'dentiacore-api'], shell=(sys.platform == 'win32'), cwd=self.server_dir, env=self.current_env, capture_output=True)
            subprocess.run(['pm2', 'delete', 'dentiacore-api'], shell=(sys.platform == 'win32'), cwd=self.server_dir, env=self.current_env, capture_output=True)
            self.using_pm2 = False
        if self.server_process:
            self.server_process.terminate()
            self.server_process = None
        self._kill_port(5002)
        # Si iniciamos Mongo, detenerlo
        if self.mongo_process:
            try:
                self.mongo_process.terminate()
            except Exception:
                pass
            self.mongo_process = None
        self.is_server_running = False
        self.update_ui_state()
        
    def start_client(self):
        """Iniciar solo el frontend"""
        if self.mode_var.get() == 'lan':
            messagebox.showinfo("Modo LAN", "En modo LAN el frontend ya se sirve desde el servidor.")
            return
        threading.Thread(target=self._start_client_thread, daemon=True).start()
        
    def _start_client_thread(self):
        """Hilo para iniciar el frontend"""
        try:
            # Matar puertos del cliente antes de iniciar
            self._kill_port(5173)
            self._kill_port(5174)
            time.sleep(1)
            
            client_dir = self.client_dir
            self._apply_mode_environment()

            self.client_process = self._safe_popen(
                ['npm', 'run', 'dev'],
                shell=(sys.platform == 'win32'),
                cwd=client_dir,
                env=self.current_env
            )
            
            time.sleep(3)  # Aumentar tiempo de espera
            self.is_client_running = True
            self.root.after(0, self.update_ui_state)
            
        except Exception as e:
            self.is_client_running = False
            self.root.after(0, lambda: messagebox.showerror("Error", f"Error al iniciar frontend: {str(e)}"))
            self.root.after(0, self.update_ui_state)
            
    def stop_client(self):
        """Detener solo el frontend"""
        if self.client_process:
            self.client_process.terminate()
            self.client_process = None
        self._kill_port(5173)
        self._kill_port(5174)
        self.is_client_running = False
        self.update_ui_state()
        
    def open_app(self):
        """Abrir la aplicación en el navegador"""
        target_url = None
        if self.is_client_running:
            target_url = 'http://localhost:5173'
        else:
            env = self.current_env or {}
            target_url = env.get('PUBLIC_URL', self.lan_url_var.get())

        if not target_url:
            messagebox.showwarning("Advertencia", "No se pudo determinar la URL de la aplicación")
            return

        webbrowser.open(target_url)

    def _auto_open_browser(self, url):
        """Auto-abre el browser tras un arranque exitoso. Silencioso si falla."""
        try:
            print(f"🌐 Abriendo navegador en {url}")
            webbrowser.open(url)
        except Exception as e:
            print(f"⚠️ No se pudo abrir el navegador automáticamente: {e}")

    def _mongo_service_failure_dialog(self):
        """
        Muestra dialog cuando el servicio Windows MongoDB existe pero no responde.
        Lee el log de mongod (en <repo>/DB/logs/mongod.log, donde el servicio escribe).
        """
        log_paths = [
            self.db_dir / 'logs' / 'mongod.log',
            self.db_dir / 'logs' / 'mongod-launcher.log',
        ]
        log_content = ''
        used_log = None
        for lp in log_paths:
            try:
                if lp.exists():
                    content = self._tail_file(str(lp), lines=25) or ''
                    if content.strip():
                        log_content = content
                        used_log = lp
                        break
            except Exception:
                continue
        if not log_content.strip():
            log_content = '(no se encontró log de mongod — revisa DB\\logs\\)'

        msg = (
            'El servicio Windows "MongoDB" existe pero no responde en el puerto 27017.\n\n'
            'Soluciones rápidas (en orden):\n'
            '  1. Abre cmd como administrador y corre:\n'
            '     net stop MongoDB\n'
            '     net start MongoDB\n\n'
            '  2. Si sigue fallando, mata procesos zombi:\n'
            '     taskkill /F /IM mongod.exe\n'
            '     net start MongoDB\n\n'
            '  3. Como último recurso, reinstala con EJECUTAR_INSTALADOR.bat\n\n'
            f'Log consultado: {used_log or "(ninguno)"}\n\n'
            f'Últimas líneas:\n{"-" * 50}\n{log_content[:1800]}'
        )
        self.root.after(0, lambda: messagebox.showerror('MongoDB Service no responde', msg))
        return False
            
    def clear_patients(self):
        """Limpiar todos los pacientes"""
        if not self.is_server_running:
            messagebox.showwarning("Advertencia", "El servidor debe estar ejecutándose")
            return
            
        result = messagebox.askyesno(
            "Confirmar", 
            "¿Estás seguro de que quieres eliminar todos los pacientes?\n\nEsta acción no se puede deshacer."
        )
        
        if result:
            threading.Thread(target=self._clear_patients_thread, daemon=True).start()
            
    def _clear_patients_thread(self):
        """Hilo para limpiar pacientes"""
        try:
            result = subprocess.run(
                ['node', 'delete-all-patients.js'],
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                shell=(sys.platform == 'win32')
            )
            
            if result.returncode == 0:
                self.root.after(0, lambda: messagebox.showinfo("Éxito", "Pacientes eliminados correctamente"))
            else:
                self.root.after(0, lambda: messagebox.showerror("Error", f"Error al eliminar pacientes: {result.stderr}"))
                
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Error", f"Error: {str(e)}"))
            
    def open_folder(self):
        """Abrir la carpeta del proyecto"""
        project_path = str(self.project_dir)
        if sys.platform == 'win32':
            os.startfile(project_path)
        elif sys.platform == 'darwin':
            subprocess.run(['open', project_path])
        else:
            subprocess.run(['xdg-open', project_path])

    def _ensure_client_build(self):
        """Construir el frontend para producción si corresponde."""
        dist_index = self.client_dir / 'dist' / 'index.html'
        env = self.current_env or {}
        # En modo LAN, siempre reconstruimos para recoger cambios en VITE_API_URL/PUBLIC_URL
        force_build = env.get('DENT_MODE') == 'lan'
        if dist_index.exists() and not force_build:
            return
        try:
            self.root.after(0, lambda: (self.start_all_btn.config(state='disabled'),
                                          self._start_spinner(self.start_all_btn, 'Construyendo frontend...')))
            subprocess.run(
                ['npm', 'run', 'build'],
                shell=(sys.platform == 'win32'),
                cwd=self.client_dir,
                env=env,
                check=True
            )
        except subprocess.CalledProcessError as e:
            self.root.after(0, lambda: messagebox.showerror('Build Frontend', f'Fallo al construir el frontend: {e}'))

    def _ensure_mongo_running(self):
        """Verifica que MongoDB esté ejecutándose en cualquier plataforma."""
        # Para Unix/macOS/Linux
        if sys.platform != 'win32':
            if self._is_mongod_process_running():
                print("✅ MongoDB proceso detectado en Unix")
                if self._wait_for_mongo_ready():
                    return True
                print("⚠️ Se detectó proceso mongod pero no respondió en 27017. Reintentando arranque...")
            return self._ensure_mongo_running_unix()

        # Para Windows — flujo refactorizado para diagnóstico claro
        return self._ensure_mongo_running_win()

    def _is_port_listening(self, host='127.0.0.1', port=27017, timeout=2):
        """Verifica rápidamente si alguien está escuchando en host:port."""
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except (socket.timeout, OSError):
            return False

    def _is_mongod_process_running_win(self):
        """Verifica si hay un proceso mongod.exe vivo (Windows)."""
        try:
            check = subprocess.run(
                ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
                shell=True,
                capture_output=True,
                text=True,
                timeout=5,
            )
            return 'mongod.exe' in (check.stdout or '')
        except Exception:
            return False

    def _windows_mongo_service_exists(self):
        """¿Está instalado el servicio de Windows 'MongoDB'? (lo crea install.ps1)"""
        try:
            r = subprocess.run(
                ['sc', 'query', 'MongoDB'],
                shell=True, capture_output=True, text=True, timeout=5,
            )
            return r.returncode == 0
        except Exception:
            return False

    def _windows_mongo_service_status(self):
        """Devuelve el estado del servicio Windows 'MongoDB' o None si no existe."""
        try:
            r = subprocess.run(
                ['sc', 'query', 'MongoDB'],
                shell=True, capture_output=True, text=True, timeout=5,
            )
            if r.returncode != 0:
                return None
            for line in (r.stdout or '').splitlines():
                line = line.strip()
                if line.upper().startswith('STATE'):
                    # ej: "STATE              : 4  RUNNING"
                    upper = line.upper()
                    if 'RUNNING' in upper: return 'RUNNING'
                    if 'STOPPED' in upper: return 'STOPPED'
                    if 'START_PENDING' in upper: return 'START_PENDING'
                    if 'STOP_PENDING' in upper: return 'STOP_PENDING'
                    return 'OTHER'
            return 'OTHER'
        except Exception:
            return None

    def _ensure_mongo_running_win(self):
        """
        Flujo robusto para arrancar MongoDB en Windows:
        1) Puerto 27017 abierto → usar lo que sea esté corriendo
        2) Servicio Windows "MongoDB" instalado (lo crea install.ps1) → `net start MongoDB`
        3) Proceso mongod.exe vivo → esperar puerto
        4) Buscar binario y arrancar manual con --logpath (sin ventana)
        Cualquier fallo muestra dialog con últimas líneas del log para diagnóstico.
        """
        # 1) Puerto ya escuchando
        if self._is_port_listening('127.0.0.1', 27017):
            print("✅ Puerto 27017 ya está escuchando")
            return self._wait_for_mongo_ready(timeout=10)

        # 2) ¿Servicio Windows 'MongoDB' instalado? (caso típico tras correr install.ps1)
        #    Hay que usar el SERVICIO en vez de arrancar mongod manualmente — si
        #    arrancamos uno nuevo apuntando al mismo --dbpath habrá DB lock.
        service_status = self._windows_mongo_service_status()
        if service_status is not None:
            print(f"ℹ️ Servicio Windows 'MongoDB' detectado (status={service_status})")
            if service_status == 'RUNNING':
                if self._wait_for_mongo_ready(timeout=15):
                    return True
                print("⚠️ Servicio reporta RUNNING pero no responde en 27017")
            else:
                # Arrancar el servicio
                print("🔄 Arrancando servicio MongoDB con net start...")
                try:
                    r = subprocess.run(
                        ['net', 'start', 'MongoDB'],
                        shell=True, capture_output=True, text=True, timeout=30, check=False,
                    )
                    out = (r.stdout or '').strip() or (r.stderr or '').strip()
                    if out:
                        print(f"   net start: {out}")
                except subprocess.TimeoutExpired:
                    print("⚠️ net start MongoDB tomó >30s")
                except Exception as e:
                    print(f"⚠️ net start MongoDB falló: {e}")

                if self._wait_for_mongo_ready(timeout=20):
                    return True

            # Servicio existe pero no responde — leer su log y reportar
            return self._mongo_service_failure_dialog()

        # 3) Proceso vivo sin servicio (raro pero posible)
        if self._is_mongod_process_running_win():
            print("✅ Proceso mongod.exe detectado (sin servicio), esperando puerto...")
            if self._wait_for_mongo_ready(timeout=30):
                return True
            print("⚠️ Proceso mongod existe pero puerto no responde — reintentando arranque limpio")

        # 4) No hay servicio ni proceso — buscar binario y arrancar manual
        exe_path = self._find_mongod_exe()
        if not exe_path:
            self.root.after(0, lambda: messagebox.showerror(
                'MongoDB no encontrado',
                'No se encontró mongod.exe ni un servicio MongoDB instalado.\n\n'
                'Soluciones (en orden):\n'
                '  1. Corre el instalador como administrador:\n'
                '     EJECUTAR_INSTALADOR.bat (registra el servicio Windows)\n\n'
                '  2. O verifica que exista: tools\\mongo\\bin\\mongod.exe\n\n'
                '  3. O instala MongoDB Community Server:\n'
                '     https://www.mongodb.com/try/download/community\n\n'
                'Después cierra y vuelve a abrir el launcher.'
            ))
            return False

        print(f"🔎 mongod localizado: {exe_path}")
        version = self._get_mongod_version(exe_path)
        if version:
            print(f"   versión: {version}")

        # 4) Preparar carpetas y log
        try:
            self.db_dir.mkdir(exist_ok=True)
            (self.db_dir / 'logs').mkdir(exist_ok=True)
        except Exception as e:
            print(f"⚠️ No se pudo crear carpeta DB/logs: {e}")

        log_file = self.db_dir / 'logs' / 'mongod-launcher.log'

        cmd = [
            str(exe_path),
            '--dbpath', str(self.db_dir),
            '--bind_ip', '127.0.0.1',
            '--logpath', str(log_file),
            '--logappend',
        ]
        print(f"🔄 Lanzando mongod (silencioso, log → {log_file})")

        try:
            # CREATE_NO_WINDOW = 0x08000000 — no abre consola visible.
            # stdout/stderr a DEVNULL porque ya escribimos a --logpath.
            self.mongo_process = subprocess.Popen(
                cmd,
                cwd=str(self.project_dir),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=0x08000000,
            )
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror(
                'Error al arrancar MongoDB',
                f'No se pudo ejecutar mongod.exe:\n\n{e}\n\nPath:\n{exe_path}'
            ))
            return False

        # 5) Esperar puerto abierto
        if self._wait_for_mongo_ready(timeout=30):
            print(f"✅ MongoDB listo (PID {self.mongo_process.pid})")
            return True

        # 6) Falló — leer log para diagnóstico
        log_content = ''
        try:
            if log_file.exists():
                log_content = self._tail_file(str(log_file), lines=25) or ''
        except Exception:
            pass
        if not log_content.strip():
            log_content = '(log vacío o no se pudo leer — revisa permisos)'

        # Diagnóstico común: si el proceso terminó solo, leer su exit code
        rc = None
        try:
            if self.mongo_process and self.mongo_process.poll() is not None:
                rc = self.mongo_process.returncode
        except Exception:
            pass

        msg = (
            f'mongod.exe se ejecutó pero no respondió en el puerto 27017 en 30 segundos.\n\n'
            f'Path usado:    {exe_path}\n'
            f'DB folder:     {self.db_dir}\n'
            f'Log:           {log_file}\n'
            f'Exit code:     {rc if rc is not None else "(aún corriendo)"}\n\n'
            f'Últimas líneas del log:\n{"-" * 50}\n{log_content[:1800]}'
        )
        self.root.after(0, lambda: messagebox.showerror('MongoDB no respondió', msg))
        return False

    def _wait_for_mongo_ready(self, host='127.0.0.1', port=27017, timeout=30):
        """Espera activa a que MongoDB acepte conexiones TCP en el puerto indicado.

        Usa intentos con backoff exponencial para evitar falsos positivos (proceso presente pero socket no listo).
        """
        start_time = time.time()
        attempt = 1
        while time.time() - start_time < timeout:
            try:
                with socket.create_connection((host, port), timeout=3):
                    print(f"✅ MongoDB listo en {host}:{port}")
                    return True
            except (socket.timeout, OSError) as e:
                reason = str(e)
                if 'timed out' in reason.lower():
                    print(f"⏱️ Intento {attempt}: Timeout esperando {host}:{port}")
                elif 'actively refused' in reason.lower() or 'refused' in reason.lower():
                    print(f"🔄 Intento {attempt}: Conexión rechazada por {host}:{port}")
                else:
                    print(f"🔄 Intento {attempt}: Mongo aún no listo ({reason})")
            time.sleep(min(2 ** attempt, 5))
            attempt += 1
        print(f"❌ Timeout: MongoDB no aceptó conexiones en {host}:{port} tras {timeout}s")
        self.root.after(0, lambda: messagebox.showerror(
            'MongoDB no disponible',
            f'No se pudo establecer conexión con MongoDB en {host}:{port}.\n\n'
            'Verifica que el servicio esté ejecutándose y sin errores.'
        ))
        return False

    # ── Funciones auxiliares para macOS/Linux ──────────────────────────────

    def _ensure_mongo_running_unix(self):
        """Verifica y inicia MongoDB en macOS/Linux."""
        try:
            # Buscar mongod usando las rutas conocidas (incluye /opt/homebrew para Apple Silicon)
            mongod_path = self._find_mongod_unix() or 'mongod'

            # Verificar si mongod está disponible
            result = subprocess.run(
                [mongod_path, '--version'],
                shell=False,
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                # mongod está disponible, intentar arrancar usando brew services (macOS)
                if sys.platform == 'darwin':
                    try:
                        # Probar variantes comunes del nombre de servicio en Homebrew
                        brew_services = [
                            'mongodb-community',
                            'mongodb/brew/mongodb-community',
                            'mongodb-community@8.0',
                            'mongodb-community@7.0',
                            'mongodb-community@6.0',
                        ]
                        for service_name in brew_services:
                            proc = subprocess.run(
                                ['brew', 'services', 'start', service_name],
                                capture_output=True,
                                text=True,
                                timeout=12,
                                check=False
                            )
                            if proc.returncode == 0:
                                print(f"🔄 Iniciando MongoDB con brew services ({service_name})...")
                                time.sleep(3)
                                if self._wait_for_mongo_ready(timeout=12):
                                    return True

                        # brew services no logró iniciar MongoDB, intentar mongod directo
                        print("⚠️ brew services no inició MongoDB, intentando mongod directo...")
                    except Exception as e:
                        print(f"⚠️ brew services no disponible: {e}")

                # Fallback: lanzar mongod directamente
                db_dir = self.project_dir / 'DB'
                db_dir.mkdir(exist_ok=True)
                (db_dir / 'logs').mkdir(exist_ok=True)

                log_file = str(db_dir / 'logs' / 'mongod.log')
                cmd = [
                    mongod_path,
                    '--dbpath', str(db_dir),
                    '--logpath', log_file,
                    '--bind_ip', '0.0.0.0',
                ]

                self.mongo_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    preexec_fn=os.setsid if sys.platform != 'win32' else None
                )
                print(f"🔄 MongoDB iniciado (PID: {self.mongo_process.pid})")
                time.sleep(2)
                return self._wait_for_mongo_ready()
        except Exception as e:
            print(f"⚠️ Error al iniciar MongoDB en UNIX: {e}")
            return False

        # mongod --version falló: MongoDB no está instalado
        print("⚠️ mongod no está disponible en este sistema")
        return False

    def _find_mongod_unix(self):
        """Encuentra mongod en sistemas Unix (macOS/Linux)."""
        import shutil

        # Rutas comunes para diferentes gestores de paquetes e instalaciones manuales
        # Orden: Apple Silicon Homebrew, Intel Homebrew, MacPorts, instalaciones manuales
        homebrew_paths = [
            # Apple Silicon (M1/M2/M3) - Homebrew
            '/opt/homebrew/bin/mongod',
            '/opt/homebrew/opt/mongodb-community/bin/mongod',
            '/opt/homebrew/opt/mongodb-community@8.0/bin/mongod',
            '/opt/homebrew/opt/mongodb-community@7.0/bin/mongod',
            '/opt/homebrew/opt/mongodb-community@6.0/bin/mongod',
            
            # Intel Macs - Homebrew
            '/usr/local/bin/mongod',
            '/usr/local/opt/mongodb-community/bin/mongod',
            '/usr/local/opt/mongodb-community@8.0/bin/mongod',
            '/usr/local/opt/mongodb-community@7.0/bin/mongod',
            '/usr/local/opt/mongodb-community@6.0/bin/mongod',
            
            # MacPorts
            '/opt/local/bin/mongod',
            '/opt/local/opt/mongodb-community/bin/mongod',
            
            # Instalación manual en directorios comunes
            '/usr/local/mongodb/bin/mongod',
            '/opt/mongodb/bin/mongod',
            Path.home() / 'mongodb' / 'bin' / 'mongod',
            Path.home() / '.local' / 'mongodb' / 'bin' / 'mongod',
        ]

        # Intentar rutas comunes primero
        for path_str in homebrew_paths:
            path = Path(path_str)
            if path.exists():
                return str(path)

        # Intentar encontrar en PATH
        mongod_path = shutil.which('mongod')
        if mongod_path:
            return mongod_path

        # Búsqueda en variables de entorno
        env_paths = os.environ.get('MONGODB_HOME', '') or os.environ.get('MONGO_HOME', '')
        if env_paths:
            for base_path in env_paths.split(':'):
                mongo_bin = Path(base_path) / 'bin' / 'mongod'
                if mongo_bin.exists():
                    return str(mongo_bin)

        return None

    def _is_mongod_process_running(self):
        """Verifica si hay un proceso mongod ejecutándose en Unix."""
        try:
            result = subprocess.run(
                ['pgrep', '-f', 'mongod'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return True
        except FileNotFoundError:
            # pgrep no disponible, usar ps como fallback
            pass

        # Fallback a ps (disponible en todos los sistemas Unix)
        try:
            result = subprocess.run(
                ['ps', 'aux'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return 'mongod' in (result.stdout or '')
        except Exception:
            return False

    # ── Fin de funciones auxiliares para macOS/Linux ──────────────────────────────

    def _find_mongod_exe(self):
        """Busca mongod.exe priorizando la versión embebida del proyecto y luego otras fuentes."""
        import shutil
        
        # 1. Preferir la ruta del proyecto (tools/mongo/bin, etc.)
        project_path = self._find_mongod_in_project()
        if project_path:
            return project_path
        
        # 2. Intentar encontrar mongod en PATH
        mongod_in_path = shutil.which('mongod')
        if mongod_in_path:
            return mongod_in_path
        
        # 3. Buscar usando variables de entorno
        env_path = self._find_mongod_from_env()
        if env_path:
            return env_path
        
        # 4. Buscar en el registro de Windows
        registry_path = self._find_mongod_from_registry()
        if registry_path:
            return registry_path
        
        # 5. Búsqueda dinámica en unidades del sistema
        dynamic_path = self._find_mongod_dynamic_search()
        if dynamic_path:
            return dynamic_path
        
        return None

    def _get_mongod_version(self, exe_path=None):
        """Obtiene la versión de mongod ejecutando '--version'. Devuelve 'major.minor.patch' o None."""
        try:
            import re
            if exe_path:
                cmd = [exe_path, '--version']
                shell_flag = False
            else:
                cmd = ['mongod', '--version']
                shell_flag = True
            result = subprocess.run(
                cmd,
                shell=shell_flag,
                capture_output=True,
                text=True,
                timeout=5
            )
            output = (result.stdout or '') + '\n' + (result.stderr or '')
            m = re.search(r"db version v(\d+\.\d+\.\d+)", output, re.IGNORECASE)
            if m:
                return m.group(1)
        except Exception:
            pass
        return None
    
    def _find_mongod_from_env(self):
        """Busca MongoDB usando variables de entorno."""
        env_vars = ['MONGODB_HOME', 'MONGO_HOME', 'MONGODB_PATH', 'MONGO_PATH']
        
        for env_var in env_vars:
            env_path = os.environ.get(env_var)
            if env_path:
                # Buscar en la ruta de la variable de entorno
                for subdir in ['bin', '.', 'Server/bin']:
                    candidate = Path(env_path) / subdir / 'mongod.exe'
                    if candidate.exists():
                        return str(candidate)
                
                # Búsqueda recursiva en la ruta de la variable
                try:
                    for item in Path(env_path).rglob('mongod.exe'):
                        if item.is_file():
                            return str(item)
                except Exception:
                    continue
        
        return None
    
    def _find_mongod_from_registry(self):
        """Busca MongoDB en el registro de Windows."""
        try:
            import winreg
            
            # Claves del registro donde MongoDB podría estar registrado
            registry_keys = [
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\MongoDB"),
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\MongoDB"),
                (winreg.HKEY_CURRENT_USER, r"SOFTWARE\MongoDB"),
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            ]
            
            for hkey, subkey in registry_keys:
                try:
                    with winreg.OpenKey(hkey, subkey) as key:
                        # Buscar entradas relacionadas con MongoDB
                        i = 0
                        while True:
                            try:
                                subkey_name = winreg.EnumKey(key, i)
                                if 'mongo' in subkey_name.lower():
                                    # Intentar obtener la ruta de instalación
                                    with winreg.OpenKey(key, subkey_name) as mongo_key:
                                        try:
                                            install_path, _ = winreg.QueryValueEx(mongo_key, "InstallLocation")
                                            if install_path:
                                                for subdir in ['bin', 'Server/bin']:
                                                    candidate = Path(install_path) / subdir / 'mongod.exe'
                                                    if candidate.exists():
                                                        return str(candidate)
                                        except FileNotFoundError:
                                            pass
                                i += 1
                            except OSError:
                                break
                except Exception:
                    continue
        except ImportError:
            pass  # winreg no disponible en sistemas no-Windows
        
        return None
    
    def _find_mongod_in_project(self):
        """Busca MongoDB en rutas relativas del proyecto."""
        # Buscar en subdirectorios del proyecto
        project_subdirs = ['tools', 'bin', 'mongodb', 'mongo', 'database']
        
        for subdir in project_subdirs:
            base_path = self.project_dir / subdir
            if base_path.exists():
                try:
                    for item in base_path.rglob('mongod.exe'):
                        if item.is_file():
                            return str(item)
                except Exception:
                    continue
        
        return None
    
    def _find_mongod_dynamic_search(self):
        """Búsqueda dinámica en unidades del sistema sin rutas hardcodeadas."""
        import string
        
        # Obtener todas las unidades disponibles
        available_drives = []
        for letter in string.ascii_uppercase:
            drive = f"{letter}:\\"
            if os.path.exists(drive):
                available_drives.append(drive)
        
        # Directorios comunes donde podría estar MongoDB (sin rutas absolutas)
        common_dirs = ['MongoDB', 'Program Files/MongoDB', 'Program Files (x86)/MongoDB']
        
        for drive in available_drives:
            for common_dir in common_dirs:
                search_path = Path(drive) / common_dir
                if search_path.exists():
                    try:
                        # Búsqueda recursiva limitada (máximo 3 niveles de profundidad)
                        for item in search_path.rglob('mongod.exe'):
                            if item.is_file():
                                # Verificar que no sea demasiado profundo
                                relative_path = item.relative_to(search_path)
                                if len(relative_path.parts) <= 4:  # Limitar profundidad
                                    return str(item)
                    except Exception:
                        continue
        
        return None

    def _launch_mongod_in_terminal(self, exe_path, use_shell, cfg, db_dir):
        """Abre una ventana de PowerShell o CMD y ejecuta mongod con la configuración dada."""
        try:
            db_dir.mkdir(exist_ok=True)
            (db_dir / 'logs').mkdir(exist_ok=True)
        except Exception:
            pass
        exe = exe_path if exe_path else 'mongod'
        use_shell = (use_shell or 'powershell').lower()
        if use_shell == 'cmd':
            # Forzar siempre --dbpath para apuntar a la carpeta DB del proyecto.
            if cfg.exists():
                # Añadimos --bind_ip para permitir conexiones desde la LAN cuando abrimos mongod en terminal
                inner = f'"{exe}" --config "{cfg}" --dbpath "{db_dir}" --bind_ip 0.0.0.0'
            else:
                inner = f'"{exe}" --dbpath "{db_dir}" --bind_ip 0.0.0.0'
            command = ['cmd.exe', '/c', f'cd /d "{self.project_dir}" && {inner}']
            try:
                subprocess.Popen(
                    command,
                    cwd=str(self.project_dir),
                    creationflags=subprocess.CREATE_NEW_CONSOLE
                )
            except (OSError, Exception) as e:
                print(f"⚠️ Error al abrir CMD: {e}, intentando sin nueva consola...")
                try:
                    subprocess.Popen(
                        command,
                        cwd=str(self.project_dir)
                    )
                except Exception as e2:
                    print(f"❌ Error al lanzar mongod: {e2}")
        else:
            # PowerShell: usar variables para evitar problemas con espacios en paths
            ps_cmds = [f"Set-Location '{self.project_dir}'"]
            
            # Usar variables PS para manejar rutas con espacios correctamente
            ps_cmds.append(f"$exe = @'{exe}'; $dbdir = @'{db_dir}'; $config = @'{cfg}'")
            
            if cfg.exists():
                # Variables PowerShell manejo seguro
                ps_cmds.append("$cmd = @($exe.Trim('\"'), '--config', $config.Trim('\"'), '--dbpath', $dbdir.Trim('\"'), '--bind_ip', '0.0.0.0')")
            else:
                ps_cmds.append("$cmd = @($exe.Trim('\"'), '--dbpath', $dbdir.Trim('\"'), '--bind_ip', '0.0.0.0')")
            
            ps_cmds.append("& $cmd[0] @($cmd[1..($cmd.Length-1)])")
            
            command = ['powershell.exe', '-NoProfile', '-Command', '; '.join(ps_cmds)]
            try:
                subprocess.Popen(
                    command,
                    cwd=str(self.project_dir),
                    creationflags=subprocess.CREATE_NEW_CONSOLE
                )
            except (OSError, Exception) as e:
                print(f"⚠️ Error al abrir PowerShell: {e}, intentando sin nueva consola...")
                try:
                    subprocess.Popen(
                        command,
                        cwd=str(self.project_dir)
                    )
                except Exception as e2:
                    print(f"❌ Error al lanzar mongod: {e2}")
        
        time.sleep(2)
        check = subprocess.run(
            ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
            shell=True,
            capture_output=True,
            text=True
        )
        if 'mongod.exe' in (check.stdout or ''):
            print('✅ MongoDB lanzado en ventana de terminal')
            return True
        return False
            
    def _get_latest_server_log(self):
        """Devuelve la ruta del log más reciente del backend, o None."""
        try:
            logs_dir = self.server_dir / 'logs'
            if not logs_dir.exists():
                return None
            candidates = sorted(logs_dir.glob('dent-*.log'), reverse=True)
            return candidates[0] if candidates else None
        except Exception:
            return None

    def _tail_file(self, path, lines=60):
        """Lee las últimas líneas de un archivo para diagnóstico rápido."""
        try:
            with open(path, 'rb') as f:
                f.seek(0, os.SEEK_END)
                size = f.tell()
                block = 4096
                data = b''
                while len(data.splitlines()) <= lines and size > 0:
                    jump = min(block, size)
                    size -= jump
                    f.seek(size)
                    data = f.read(jump) + data
                return '\n'.join(line.decode('utf-8', errors='replace') for line in data.splitlines()[-lines:])
        except Exception:
            return None

    def _wait_for_server_ready(self, url, timeout=45, process=None):
        """
        Espera a que el servidor esté listo con sistema de reintentos mejorado.
        Si el proceso del servidor muere, aborta temprano y muestra logs.
        """
        health_url = f"{url}/api/health"
        start_time = time.time()
        attempt = 1
        max_attempts = 3
        
        print(f"🔍 Verificando disponibilidad del servidor en {health_url}")
        
        while time.time() - start_time < timeout:
            try:
                print(f"📡 Intento {attempt}: Verificando servidor...")
                
                # Crear request con timeout específico
                request = urllib.request.Request(health_url)
                request.add_header('User-Agent', 'DentiaCore-Launcher/1.0')
                
                with urllib.request.urlopen(request, timeout=5) as response:
                    if response.status == 200:
                        print(f"✅ Servidor disponible en {health_url}")
                        return True
                    else:
                        print(f"⚠️ Servidor respondió con código {response.status}")
                        
            except urllib.error.URLError as e:
                if hasattr(e, 'reason'):
                    if 'Connection refused' in str(e.reason):
                        print(f"🔄 Intento {attempt}: Servidor aún no disponible (conexión rechazada)")
                    elif 'timeout' in str(e.reason).lower():
                        print(f"⏱️ Intento {attempt}: Timeout al conectar con el servidor")
                    else:
                        print(f"🔄 Intento {attempt}: Error de conexión - {e.reason}")
                elif hasattr(e, 'code'):
                    print(f"⚠️ Intento {attempt}: Servidor respondió con código HTTP {e.code}")
                else:
                    print(f"🔄 Intento {attempt}: Error de URL - {str(e)}")
                    
            except Exception as e:
                print(f"❌ Intento {attempt}: Error inesperado - {str(e)}")

            # Si el proceso se cayó, abortar y mostrar logs
            if process is not None and process.poll() is not None:
                code = process.returncode
                print(f"⛔ El proceso del servidor terminó con código {code} antes de estar listo")
                break
            
            # Sistema de reintentos con backoff exponencial
            if attempt < max_attempts:
                wait_time = min(2 ** attempt, 5)  # Máximo 5 segundos entre intentos
                print(f"⏳ Esperando {wait_time} segundos antes del siguiente intento...")
                time.sleep(wait_time)
                attempt += 1
            else:
                # Resetear contador de intentos para continuar con intervalos regulares
                attempt = 1
                time.sleep(1.5)
        
        elapsed = time.time() - start_time
        print(f"❌ Timeout: Servidor no disponible después de {elapsed:.1f} segundos")

        # Diagnóstico adicional
        try:
            mongo_ok = self._check_mongodb_status()
        except Exception:
            mongo_ok = False
        try:
            port_free = self._check_port_availability(5002)
        except Exception:
            port_free = None
        env = self.current_env or {}
        print("📋 Diagnóstico rápido:")
        print(f"   • MongoDB en ejecución: {'sí' if mongo_ok else 'no'}")
        if port_free is not None:
            print(f"   • Puerto 5002 libre: {'sí' if port_free else 'no (ocupado)'}")
        print(f"   • DENT_MODE={env.get('DENT_MODE')} | HOST={env.get('HOST')} | PORT={env.get('PORT')}")
        print(f"   • PUBLIC_URL={env.get('PUBLIC_URL')} | CLIENT_URL={env.get('CLIENT_URL')} | VITE_API_URL={env.get('VITE_API_URL')}")

        log_path = self._get_latest_server_log()
        if log_path:
            tail = self._tail_file(log_path)
            if tail:
                print(f"🧾 Últimas líneas de {log_path}:")
                print(tail)

        print("💡 Sugerencias:")
        print("   1) Verifica que MongoDB esté ejecutándose (puerto 27017). Puedes ejecutar 'npm run mongod'.")
        print("   2) Revisa que el puerto 5002 no esté ocupado por otro proceso o bloqueado por el firewall.")
        print("   3) Asegúrate de que las dependencias estén instaladas (npm install) y revisa 'Server/logs'.")
        
        return False
            
    def update_ui_state(self):
        """Actualizar el estado de la interfaz — Design System"""
        C = self.colors
        current_mode = self.mode_var.get()

        # Detener spinners (el estado final reemplaza el texto animado)
        self._stop_spinner(self.start_all_btn)
        self._stop_spinner(self.stop_all_btn)

        # Estado del servidor (badge + botón individual)
        if self.is_server_running:
            self._update_status_badge(self.server_status, 'EN LÍNEA', C['success'])
            self.server_btn.config(text='■   Detener Servidor')
            self.server_btn._orig_bg = C['danger']
            self.server_btn.config(bg=C['danger'])
        else:
            self._update_status_badge(self.server_status, 'DETENIDO', C['text_light'])
            self.server_btn.config(text='▶   Iniciar Servidor')
            self.server_btn._orig_bg = C['primary_light']
            self.server_btn.config(bg=C['primary_light'])

        # Estado del frontend según modo
        if current_mode == 'lan':
            if self.is_server_running:
                self._update_status_badge(self.client_status, 'SERVIDO POR API', C['success'])
            else:
                self._update_status_badge(self.client_status, 'ESPERA SERVIDOR', C['warning'])
            self.client_btn.config(text='Modo LAN activo', state='disabled')
            self.client_btn._orig_bg = C['primary_light']
            self.client_btn.config(bg=C['primary_light'])
        elif self.is_client_running:
            self._update_status_badge(self.client_status, 'EN LÍNEA', C['success'])
            self.client_btn.config(text='■   Detener Frontend', state='normal')
            self.client_btn._orig_bg = C['danger']
            self.client_btn.config(bg=C['danger'])
        else:
            self._update_status_badge(self.client_status, 'DETENIDO', C['text_light'])
            self.client_btn.config(text='▶   Iniciar Frontend', state='normal')
            self.client_btn._orig_bg = C['primary_light']
            self.client_btn.config(bg=C['primary_light'])

        # Botones principales
        all_running = self.is_server_running and (self.is_client_running or current_mode == 'lan')
        if all_running:
            self.start_all_btn.config(
                state='disabled',
                text='✓   Aplicación Ejecutándose',
            )
            self.start_all_btn._orig_bg = C['success']
            self.start_all_btn.config(bg=C['success'])
            self.stop_all_btn.config(state='normal')
        else:
            self.start_all_btn.config(
                state='normal',
                text='▶   Iniciar Aplicación Completa',
            )
            self.start_all_btn._orig_bg = C['primary']
            self.start_all_btn.config(bg=C['primary'])
            self.stop_all_btn.config(state='normal', text='■   Detener Todo')
            
    def on_closing(self):
        """Manejar el cierre de la aplicación"""
        if self.is_server_running or self.is_client_running:
            result = messagebox.askyesno(
                "Confirmar cierre",
                "Hay servicios ejecutándose. ¿Quieres detenerlos antes de cerrar?"
            )
            if result:
                self.stop_all()
                # Esperar un poco para que se detengan
                self.root.after(2000, self.root.destroy)
            else:
                self.root.destroy()
        else:
            self.root.destroy()
            
    def run(self):
        """Ejecutar la aplicación"""
        self.root.mainloop()

def _find_compatible_python():
    """On macOS, find a Python with Tcl/Tk >= 8.6 (system Python ships Tcl/Tk 8.5 which crashes on macOS 13+)."""
    candidates = [
        '/opt/homebrew/bin/python3.13',
        '/opt/homebrew/bin/python3.12',
        '/opt/homebrew/bin/python3.11',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
    ]
    for py in candidates:
        if py == sys.executable:
            continue
        if os.path.isfile(py) and os.access(py, os.X_OK):
            return py
    return None


def main():
    """Función principal"""
    # Ensure Homebrew paths are in PATH on macOS (needed when launched from Finder/.app or without shell profile)
    if sys.platform == 'darwin':
        _brew_paths = '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin'
        _current = os.environ.get('PATH', '')
        if '/opt/homebrew/bin' not in _current:
            os.environ['PATH'] = _brew_paths + ':' + _current

    # Pre-flight: detect old Tcl/Tk that crashes on modern macOS
    if sys.platform == 'darwin' and tk.TkVersion < 8.6:
        better = _find_compatible_python()
        if better:
            os.execv(better, [better] + sys.argv)
        else:
            print(
                "ERROR: El Python actual usa Tcl/Tk"
                f" {tk.TkVersion} que no es compatible con esta versión de macOS.\n"
                "Solución: instala Python de Homebrew:\n"
                "  brew install python-tk@3.13\n"
                "Luego ejecuta:\n"
                "  /opt/homebrew/bin/python3.13 launcher.py",
                file=sys.stderr,
            )
            sys.exit(1)

    try:
        app = DentiaCoreLauncher()
        app.run()
    except Exception as e:
        messagebox.showerror("Error Fatal", f"Error al iniciar la aplicación: {str(e)}")

if __name__ == "__main__":
    main()
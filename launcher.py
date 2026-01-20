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
            'text_light': '#95a5a6',
            'bg_white': '#fff',
            'bg_light': '#f9f9f9',
            'success': '#27ae60',
            'warning': '#f39c12',
            'danger': '#e74c3c',
            'border_light': '#e8e8e8'
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
        self.root.title("DentiaCore Application Launcher")
        self.root.geometry("520x780")
        self.root.minsize(520, 720)
        self.root.configure(bg=self.colors['bg_light'])
        self.root.resizable(False, True)
        
        # Centrar ventana
        self.center_window()
        
        # Configurar cierre de ventana
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        
    def center_window(self):
        """Centrar la ventana en la pantalla"""
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")
        
    def create_widgets(self):
        """Crear todos los widgets de la interfaz"""
        # Frame principal
        main_frame = tk.Frame(self.root, bg=self.colors['bg_light'], padx=30, pady=20)
        main_frame.pack(fill='both', expand=True)
        
        # Título
        title_label = tk.Label(
            main_frame,
            text="🦷 DentiaCore Application Launcher",
            font=('Montserrat', 20, 'bold'),
            fg=self.colors['primary'],
            bg=self.colors['bg_light']
        )
        title_label.pack(pady=(0, 30))
        
        # Frame de estado
        status_frame = tk.Frame(main_frame, bg=self.colors['bg_white'], relief='solid', bd=1)
        status_frame.pack(fill='x', pady=(0, 20))
        
        status_title = tk.Label(
            status_frame,
            text="Estado de Servicios",
            font=('Montserrat', 12, 'bold'),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_white']
        )
        status_title.pack(pady=(10, 5))
        
        # Indicadores de estado
        self.server_status = tk.Label(
            status_frame,
            text="🔴 Servidor: Detenido",
            font=('Montserrat', 10),
            fg=self.colors['text_secondary'],
            bg=self.colors['bg_white']
        )
        self.server_status.pack(pady=2)
        
        self.client_status = tk.Label(
            status_frame,
            text="🔴 Frontend: Detenido",
            font=('Montserrat', 10),
            fg=self.colors['text_secondary'],
            bg=self.colors['bg_white']
        )
        self.client_status.pack(pady=(2, 10))
        
        # Frame de botones principales
        buttons_frame = tk.Frame(main_frame, bg=self.colors['bg_light'])
        buttons_frame.pack(fill='x', pady=20)
        
        # Selección de modo
        mode_frame = tk.Frame(main_frame, bg=self.colors['bg_light'])
        mode_frame.pack(fill='x', pady=(0, 10))

        mode_label = tk.Label(
            mode_frame,
            text="Modo de despliegue",
            font=('Montserrat', 11, 'bold'),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_light']
        )
        mode_label.pack(anchor='w')

        radio_frame = tk.Frame(mode_frame, bg=self.colors['bg_light'])
        radio_frame.pack(anchor='w', pady=(5, 0))

        local_radio = tk.Radiobutton(
            radio_frame,
            text="Local",
            variable=self.mode_var,
            value='local',
            font=('Montserrat', 10),
            bg=self.colors['bg_light'],
            activebackground=self.colors['bg_light'],
            command=self.update_mode
        )
        local_radio.grid(row=0, column=0, padx=(0, 15))

        lan_radio = tk.Radiobutton(
            radio_frame,
            text="LAN",
            variable=self.mode_var,
            value='lan',
            font=('Montserrat', 10),
            bg=self.colors['bg_light'],
            activebackground=self.colors['bg_light'],
            command=self.update_mode
        )
        lan_radio.grid(row=0, column=1)

        lan_entry_frame = tk.Frame(mode_frame, bg=self.colors['bg_light'])
        lan_entry_frame.pack(fill='x', pady=(10, 0))

        self.lan_label = tk.Label(
            lan_entry_frame,
            text="URL pública (LAN):",
            font=('Montserrat', 9),
            fg=self.colors['text_secondary'],
            bg=self.colors['bg_light']
        )
        self.lan_label.pack(anchor='w')

        self.lan_entry = tk.Entry(
            lan_entry_frame,
            textvariable=self.lan_url_var,
            font=('Montserrat', 9),
            relief='solid',
            bd=1
        )
        self.lan_entry.pack(fill='x', pady=(3, 0))

        # Botón iniciar todo
        self.start_all_btn = tk.Button(
            buttons_frame,
            text="🚀 Iniciar Aplicación Completa",
            font=('Montserrat', 12, 'bold'),
            fg='white',
            bg=self.colors['primary'],
            activebackground=self.colors['primary_hover'],
            activeforeground='white',
            relief='flat',
            padx=20,
            pady=12,
            cursor='hand2',
            command=self.start_all
        )
        self.start_all_btn.pack(fill='x', pady=(0, 10))
        
        # Botón detener todo
        self.stop_all_btn = tk.Button(
            buttons_frame,
            text="⏹️ Detener Todo",
            font=('Montserrat', 12, 'bold'),
            fg='white',
            bg=self.colors['danger'],
            activebackground='#c0392b',
            activeforeground='white',
            relief='flat',
            padx=20,
            pady=12,
            cursor='hand2',
            command=self.stop_all
        )
        self.stop_all_btn.pack(fill='x', pady=(0, 20))
        
        # Separador
        separator = tk.Frame(main_frame, height=2, bg=self.colors['border_light'])
        separator.pack(fill='x', pady=10)
        
        # Frame de controles individuales
        individual_frame = tk.Frame(main_frame, bg=self.colors['bg_light'])
        individual_frame.pack(fill='x')
        
        individual_title = tk.Label(
            individual_frame,
            text="Controles Individuales",
            font=('Montserrat', 12, 'bold'),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_light']
        )
        individual_title.pack(pady=(0, 15))
        
        # Botones individuales en grid
        grid_frame = tk.Frame(individual_frame, bg=self.colors['bg_light'])
        grid_frame.pack()
        
        # Botón servidor
        self.server_btn = tk.Button(
            grid_frame,
            text="🖥️ Servidor",
            font=('Montserrat', 10, 'bold'),
            fg='white',
            bg=self.colors['primary_light'],
            activebackground=self.colors['primary'],
            activeforeground='white',
            relief='flat',
            padx=15,
            pady=8,
            cursor='hand2',
            command=self.toggle_server
        )
        self.server_btn.grid(row=0, column=0, padx=(0, 10), pady=5, sticky='ew')
        
        # Botón frontend
        self.client_btn = tk.Button(
            grid_frame,
            text="🌐 Frontend",
            font=('Montserrat', 10, 'bold'),
            fg='white',
            bg=self.colors['primary_light'],
            activebackground=self.colors['primary'],
            activeforeground='white',
            relief='flat',
            padx=15,
            pady=8,
            cursor='hand2',
            command=self.toggle_client
        )
        self.client_btn.grid(row=0, column=1, padx=(10, 0), pady=5, sticky='ew')
        
        # Configurar grid
        grid_frame.columnconfigure(0, weight=1)
        grid_frame.columnconfigure(1, weight=1)
        
        # Frame de accesos rápidos
        quick_frame = tk.Frame(main_frame, bg=self.colors['bg_light'])
        quick_frame.pack(fill='x', pady=(20, 0))
        
        quick_title = tk.Label(
            quick_frame,
            text="Accesos Rápidos",
            font=('Montserrat', 12, 'bold'),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_light']
        )
        quick_title.pack(pady=(0, 10))
        
        # Botones de acceso rápido
        quick_buttons_frame = tk.Frame(quick_frame, bg=self.colors['bg_light'])
        quick_buttons_frame.pack()
        
        # Botón abrir aplicación
        open_app_btn = tk.Button(
            quick_buttons_frame,
            text="🌍 Abrir Aplicación",
            font=('Montserrat', 9),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_white'],
            activebackground=self.colors['border_light'],
            relief='solid',
            bd=1,
            padx=10,
            pady=5,
            cursor='hand2',
            command=self.open_app
        )
        open_app_btn.grid(row=0, column=0, padx=(0, 5))
        
        # Botón limpiar pacientes
        clear_patients_btn = tk.Button(
            quick_buttons_frame,
            text="🗑️ Limpiar Pacientes",
            font=('Montserrat', 9),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_white'],
            activebackground=self.colors['border_light'],
            relief='solid',
            bd=1,
            padx=10,
            pady=5,
            cursor='hand2',
            command=self.clear_patients
        )
        clear_patients_btn.grid(row=0, column=1, padx=5)
        
        # Botón abrir carpeta
        open_folder_btn = tk.Button(
            quick_buttons_frame,
            text="📁 Abrir Carpeta",
            font=('Montserrat', 9),
            fg=self.colors['text_primary'],
            bg=self.colors['bg_white'],
            activebackground=self.colors['border_light'],
            relief='solid',
            bd=1,
            padx=10,
            pady=5,
            cursor='hand2',
            command=self.open_folder
        )
        open_folder_btn.grid(row=0, column=2, padx=(5, 0))
        
        # Actualizar estado inicial
        self.update_ui_state()
        self.update_mode()
        
    def start_all(self):
        """Iniciar servidor y frontend"""
        if not self.is_server_running and not self.is_client_running:
            self.start_all_btn.config(state='disabled', text="⏳ Iniciando...")
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
                    self.server_process = subprocess.Popen(
                        ['npm', 'run', 'start'],
                        shell=True,
                        cwd=self.server_dir,
                        env=env,
                        creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
                    )
                    self.using_pm2 = False
                target_url = env.get('PUBLIC_URL', 'http://localhost:5002')
                self.is_server_running = self._wait_for_server_ready(target_url, timeout=30)
                self.is_client_running = False
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
                self.server_process = subprocess.Popen(
                    ['npm', 'run', 'dev'],
                    shell=True,
                    cwd=self.server_dir,
                    env=env,
                    creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
                )
                self.using_pm2 = False
                
                # 3. Esperar a que el servidor esté completamente listo
                target_url = env.get('PUBLIC_URL', 'http://localhost:5002')
                self.is_server_running = self._wait_for_server_ready(target_url, timeout=60, process=self.server_process)
                
                if self.is_server_running:
                    # 4. Solo si el servidor está listo, iniciar el cliente
                    print("🔄 Servidor listo, iniciando cliente frontend...")
                    time.sleep(2)  # Pequeña pausa adicional para asegurar estabilidad
                    self.client_process = subprocess.Popen(
                        ['npm', 'run', 'client'],
                        shell=True,
                        cwd=self.project_dir,
                        env=env,
                        creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
                    )
                    # Dar tiempo al cliente para iniciar
                    time.sleep(5)
                    self.is_client_running = True
                    print("✅ Aplicación iniciada correctamente")
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
        self.stop_all_btn.config(state='disabled', text="⏳ Deteniendo...")
        threading.Thread(target=self._stop_all_thread, daemon=True).start()
        
    def _stop_all_thread(self):
        """Hilo para detener todos los servicios"""
        try:
            if self.using_pm2:
                subprocess.run(['pm2', 'stop', 'dentiacore-api'], shell=True, cwd=self.server_dir, env=self.current_env, capture_output=True)
                subprocess.run(['pm2', 'delete', 'dentiacore-api'], shell=True, cwd=self.server_dir, env=self.current_env, capture_output=True)
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
            subprocess.run(['npx', 'kill-port', '5173'], shell=True, capture_output=True)
            subprocess.run(['npx', 'kill-port', '5174'], shell=True, capture_output=True)
            subprocess.run(['npx', 'kill-port', '5002'], shell=True, capture_output=True)
            
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
            subprocess.run(
                ['npx', 'kill-port', str(port)],
                shell=True,
                capture_output=True,
                timeout=5
            )
        except Exception:
            pass  # Ignorar errores si el puerto ya está libre

    def _install_missing_dependencies(self):
        """Intenta instalar las dependencias faltantes automáticamente."""
        try:
            print("🔄 Instalando dependencias faltantes...")
            
            # Instalar en raíz
            print("📦 Instalando dependencias en raíz...")
            subprocess.run(['npm', 'install'], cwd=self.project_dir, shell=True, check=True)
            
            # Instalar en Server
            print("📦 Instalando dependencias en Server...")
            subprocess.run(['npm', 'install'], cwd=self.server_dir, shell=True, check=True)
            
            # Instalar en Client
            print("📦 Instalando dependencias en Client...")
            subprocess.run(['npm', 'install'], cwd=self.client_dir, shell=True, check=True)
            
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
        """Verificar si MongoDB está ejecutándose"""
        try:
            # Verificar proceso mongod
            result = subprocess.run(
                ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
                shell=True,
                capture_output=True,
                text=True
            )
            return 'mongod.exe' in result.stdout
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
            self.lan_entry.config(state='normal' if is_lan else 'disabled')
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
                shell=True,
                cwd=server_dir,
                env=env,
                capture_output=True
            )
            if exists.returncode == 0 and b"status" in exists.stdout.lower():
                # Reiniciar actualizando variables de entorno del demonio
                subprocess.run(
                    ['pm2', 'restart', 'dentiacore-api', '--update-env'],
                    shell=True,
                    cwd=server_dir,
                    env=env,
                    check=True
                )
            else:
                subprocess.run(
                    ['pm2', 'start', 'ecosystem.config.cjs', '--only', 'dentiacore-api', '--update-env'],
                    shell=True,
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
                    self.server_process = subprocess.Popen(
                        ['npm', 'run', 'start'],
                        shell=True,
                        cwd=server_dir,
                        env=env,
                        creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
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
                self.server_process = subprocess.Popen(
                    ['npm', 'run', 'dev'],
                    shell=True,
                    cwd=server_dir,
                    env=env,
                    creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
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
            subprocess.run(['pm2', 'stop', 'dentiacore-api'], shell=True, cwd=self.server_dir, env=self.current_env, capture_output=True)
            subprocess.run(['pm2', 'delete', 'dentiacore-api'], shell=True, cwd=self.server_dir, env=self.current_env, capture_output=True)
            self.using_pm2 = False
        if self.server_process:
            self.server_process.terminate()
            self.server_process = None
        subprocess.run(['npx', 'kill-port', '5002'], shell=True, capture_output=True)
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

            self.client_process = subprocess.Popen(
                ['npm', 'run', 'dev'],
                shell=True,
                cwd=client_dir,
                env=self.current_env,
                creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
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
        subprocess.run(['npx', 'kill-port', '5173'], shell=True, capture_output=True)
        subprocess.run(['npx', 'kill-port', '5174'], shell=True, capture_output=True)
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
                shell=True
            )
            
            if result.returncode == 0:
                self.root.after(0, lambda: messagebox.showinfo("Éxito", "Pacientes eliminados correctamente"))
            else:
                self.root.after(0, lambda: messagebox.showerror("Error", f"Error al eliminar pacientes: {result.stderr}"))
                
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Error", f"Error: {str(e)}"))
            
    def open_folder(self):
        """Abrir la carpeta del proyecto"""
        if sys.platform == 'win32':
            os.startfile(self.project_dir)
        elif sys.platform == 'darwin':
            subprocess.run(['open', self.project_dir])
        else:
            subprocess.run(['xdg-open', self.project_dir])

    def _ensure_client_build(self):
        """Construir el frontend para producción si corresponde."""
        dist_index = self.client_dir / 'dist' / 'index.html'
        env = self.current_env or {}
        # En modo LAN, siempre reconstruimos para recoger cambios en VITE_API_URL/PUBLIC_URL
        force_build = env.get('DENT_MODE') == 'lan'
        if dist_index.exists() and not force_build:
            return
        try:
            self.root.after(0, lambda: self.start_all_btn.config(text='⏳ Construyendo Frontend...', state='disabled'))
            subprocess.run(
                ['npm', 'run', 'build'],
                shell=True,
                cwd=self.client_dir,
                env=env,
                check=True
            )
        except subprocess.CalledProcessError as e:
            self.root.after(0, lambda: messagebox.showerror('Build Frontend', f'Fallo al construir el frontend: {e}'))

    def _ensure_mongo_running(self):
        """Verifica que MongoDB esté ejecutándose como servicio de Windows."""
        # Verificar si mongod está activo mediante tasklist (Windows)
        if sys.platform == 'win32':
            try:
                check = subprocess.run(
                    ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
                    shell=True,
                    capture_output=True,
                    text=True
                )
                if 'mongod.exe' in (check.stdout or ''):
                    print("✅ MongoDB proceso detectado, esperando puerto 27017...")
                    return self._wait_for_mongo_ready()
                else:
                    # 1) Intentar primero mongod local del proyecto
                    try:
                        exe_path = self._find_mongod_exe()
                        version = self._get_mongod_version(exe_path)
                        print(f"🔎 mongod detectado: {exe_path or 'PATH'} (versión {version or 'desconocida'})")
                        cfg = self.project_dir / 'mongod.cfg'
                        db_dir = self.project_dir / 'DB'
                        import os
                        use_shell = os.environ.get('MONGO_TERMINAL', 'powershell')
                        started = self._launch_mongod_in_terminal(exe_path, use_shell, cfg, db_dir)
                        if started:
                            print("🔄 mongo lanzado en terminal, esperando puerto 27017...")
                            return self._wait_for_mongo_ready()
                    except Exception as e:
                        print(f'⚠️ No se pudo abrir terminal para mongod: {e}')

                    # 2) Si la terminal no pudo abrir o mongod no arrancó, intentar arranque silencioso
                    try:
                        exe_path = self._find_mongod_exe()
                        version = self._get_mongod_version(exe_path)
                        print(f"🔎 Intento silencioso con mongod: {exe_path or 'PATH'} (versión {version or 'desconocida'})")
                        cfg = self.project_dir / 'mongod.cfg'
                        db_dir = self.project_dir / 'DB'
                        try:
                            db_dir.mkdir(exist_ok=True)
                            (db_dir / 'logs').mkdir(exist_ok=True)
                        except Exception:
                            pass
                        if exe_path:
                            cmd = [exe_path]
                            shell_flag = False
                        else:
                            cmd = ['mongod']
                            shell_flag = True

                        # Siempre forzar el dbpath al iniciar mongod para este proyecto.
                        # Si existe un fichero de config, lo usamos también pero
                        # especificamos --dbpath para asegurarnos de apuntar a la carpeta `DB`.
                        if cfg.exists():
                            cmd += ['--config', str(cfg)]
                        # Añadir siempre dbpath para forzar uso de la carpeta local DB
                        cmd += ['--dbpath', str(db_dir)]
                        # --- CORRECCIÓN: forzar bind_ip para permitir conexiones LAN si arrancamos mongod manualmente
                        cmd += ['--bind_ip', '0.0.0.0']
                        self.mongo_process = subprocess.Popen(
                            cmd,
                            cwd=str(self.project_dir),
                            shell=shell_flag,
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
                        )
                        time.sleep(2)
                        check2 = subprocess.run(
                            ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
                            shell=True,
                            capture_output=True,
                            text=True
                        )
                        if 'mongod.exe' in (check2.stdout or ''):
                            print('✅ MongoDB iniciado en modo local (mongod), esperando puerto 27017...')
                            return self._wait_for_mongo_ready()
                    except Exception as e:
                        print(f'⚠️ No se pudo iniciar mongod manualmente: {e}')

                    # 3) Fallback: intentar iniciar el servicio de MongoDB si está instalado
                    try:
                        proc = subprocess.run(
                            ['net', 'start', 'MongoDB'],
                            shell=True,
                            capture_output=True,
                            text=True,
                            check=False
                        )
                        time.sleep(2)
                        check_service = subprocess.run(
                            ['tasklist', '/FI', 'IMAGENAME eq mongod.exe'],
                            shell=True,
                            capture_output=True,
                            text=True
                        )
                        if 'mongod.exe' in (check_service.stdout or ''):
                            print("✅ Servicio MongoDB iniciado, esperando puerto 27017...")
                            return self._wait_for_mongo_ready()
                        else:
                            print("ℹ️ No se pudo iniciar el servicio MongoDB")
                    except Exception:
                        pass

                    # Si no se pudo iniciar, mostrar advertencia
                    self.root.after(0, lambda: messagebox.showwarning(
                        'MongoDB', 
                        'MongoDB no está ejecutándose.\n\n'
                        'Alternativas:\n'
                        '• Ejecuta "mongod --dbpath ./DB" en el directorio del proyecto, o\n'
                        '• Inicia el servicio global desde services.msc o con "net start MongoDB"'
                    ))
                    return False
            except Exception as e:
                print(f"⚠️ Error verificando MongoDB: {e}")
                return False
        return True

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
            subprocess.Popen(
                command,
                cwd=str(self.project_dir),
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
        else:
            ps_cmds = [f"Set-Location '{self.project_dir}'"]
            # Forzar siempre --dbpath para apuntar a la carpeta DB del proyecto.
            if cfg.exists():
                ps_cmds.append(f"& '{exe}' --config '{cfg}' --dbpath '{db_dir}'")
            else:
                ps_cmds.append(f"& '{exe}' --dbpath '{db_dir}'")
            command = ['powershell.exe', '-NoProfile', '-Command', '; '.join(ps_cmds)]
            subprocess.Popen(
                command,
                cwd=str(self.project_dir),
                creationflags=subprocess.CREATE_NEW_CONSOLE
            )
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
        """Actualizar el estado de la interfaz"""
        current_mode = self.mode_var.get()
        # Actualizar indicadores de estado
        if self.is_server_running:
            self.server_status.config(text="🟢 Servidor: Ejecutándose", fg=self.colors['success'])
            self.server_btn.config(text="⏹️ Detener Servidor")
        else:
            self.server_status.config(text="🔴 Servidor: Detenido", fg=self.colors['danger'])
            self.server_btn.config(text="▶️ Iniciar Servidor")
            
        if current_mode == 'lan':
            status_text = "🟢 Frontend servido por backend" if self.is_server_running else "🔴 Frontend: Dependiente del servidor"
            self.client_status.config(text=status_text, fg=self.colors['success'] if self.is_server_running else self.colors['danger'])
            self.client_btn.config(text="🌐 Modo LAN", state='disabled')
        elif self.is_client_running:
            self.client_status.config(text="🟢 Frontend: Ejecutándose", fg=self.colors['success'])
            self.client_btn.config(text="⏹️ Detener Frontend", state='normal')
        else:
            self.client_status.config(text="🔴 Frontend: Detenido", fg=self.colors['danger'])
            self.client_btn.config(text="▶️ Iniciar Frontend", state='normal')
            
        # Actualizar botones principales
        all_running = self.is_server_running and (self.is_client_running or current_mode == 'lan')
        if all_running:
            self.start_all_btn.config(
                state='disabled',
                text="✅ Aplicación Ejecutándose",
                bg=self.colors['success']
            )
            self.stop_all_btn.config(state='normal')
        else:
            self.start_all_btn.config(
                state='normal',
                text="🚀 Iniciar Aplicación Completa",
                bg=self.colors['primary']
            )
            self.stop_all_btn.config(state='normal', text="⏹️ Detener Todo")
            
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

def main():
    """Función principal"""
    try:
        app = DentiaCoreLauncher()
        app.run()
    except Exception as e:
        messagebox.showerror("Error Fatal", f"Error al iniciar la aplicación: {str(e)}")

if __name__ == "__main__":
    main()
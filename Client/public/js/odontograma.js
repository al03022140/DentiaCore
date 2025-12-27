/*
// Este archivo se encargará de inicializar los odontogramas
document.addEventListener('DOMContentLoaded', function() {
    // Esperar a que los elementos existan en el DOM
    const checkElements = setInterval(() => {
        const canvas1 = document.getElementById('odontograma-canvas');
        const canvas2 = document.getElementById('odontograma-canvas-2');
        
        if (canvas1 && canvas2) {
            clearInterval(checkElements);
            
            // Inicializar el primer odontograma
            const engine1 = new Engine();
            engine1.setCanvas(canvas1);
            engine1.init();
            
            // Agregar event listeners para el primer odontograma
            canvas1.addEventListener('mousemove', function(event) {
                engine1.onMouseMove(event);
            });
            canvas1.addEventListener('click', function(event) {
                engine1.onMouseClick(event);
            });
            
            // Inicializar el segundo odontograma
            const engine2 = new Engine();
            engine2.setCanvas(canvas2);
            engine2.init();
            
            // Agregar event listeners para el segundo odontograma
            canvas2.addEventListener('mousemove', function(event) {
                engine2.onMouseMove(event);
            });
            canvas2.addEventListener('click', function(event) {
                engine2.onMouseClick(event);
            });
            
            console.log('Odontogramas inicializados correctamente');
        }
    }, 500); // Verificar cada 500ms
});
*/
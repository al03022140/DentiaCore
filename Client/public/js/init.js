document.addEventListener('DOMContentLoaded', function() {
    // Crear dos instancias del Engine, una para cada canvas
    const engine1 = new Engine();
    const engine2 = new Engine();

    // Inicializar el primer odontograma
    const canvas1 = document.getElementById('odontograma-canvas');
    engine1.setCanvas(canvas1);
    engine1.init();

    // Inicializar el segundo odontograma
    const canvas2 = document.getElementById('odontograma-canvas-2');
    engine2.setCanvas(canvas2);
    engine2.init();

    // Agregar los event listeners para cada canvas
    canvas1.addEventListener('click', function(event) {
        engine1.onMouseClick(event);
    });
    canvas1.addEventListener('mousemove', function(event) {
        engine1.onMouseMove(event);
    });

    canvas2.addEventListener('click', function(event) {
        engine2.onMouseClick(event);
    });
    canvas2.addEventListener('mousemove', function(event) {
        engine2.onMouseMove(event);
    });
});
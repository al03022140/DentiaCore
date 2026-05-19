/* 
 * Copyright (c) 2018 Bardur Thomsen <https://github.com/bardurt>.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Bardur Thomsen <https://github.com/bardurt> - initial API and implementation and/or initial documentation
 */

/**
 * Helper class for drawing items on a canvas
 * @returns {Renderer}
 */
function Renderer() {
    "use strict";
    this.context = null;
    this.width = 0;
    this.height = 0;
    this.settings = null;
}

/**
 * Method to render a splash screen
 * @returns {undefined}
 */
Renderer.prototype.drawSplash = function () {
    "use strict";

    this.context.fillStyle = this.settings ? this.settings.COLOR_BG : "#ffffff";
    this.context.fillRect(0, 0, this.width, this.height);

    this.context.beginPath();
    this.context.textAlign = 'center';
    this.context.fillStyle = this.settings ? this.settings.COLOR_TEXT : "#000000";
    this.context.font = "600 32px Montserrat, Arial, sans-serif";
    this.context.fillText("OdontoGraph", this.width / 2,
            this.height / 2 - 16);

    this.context.font = "600 24px Montserrat, Arial, sans-serif";
    this.context.fillStyle = this.settings ? this.settings.COLOR_TEXT : "#000000";

    var year = new Date().getFullYear();

    this.context.fillText("Bardur Thomsen - " + year, this.width / 2, this.height / 2 + 40);
};

/**
 * Method to initialize the renderer for drawing the odontograma
 * @param {type} canvas the canvas to draw on
 * @returns {undefined}
 */
Renderer.prototype.init = function (canvas) {
    "use strict";
    console.log("Initializing renderer for canvas");

    // HiDPI scaling: subimos la resolución física del canvas a window.devicePixelRatio
    // para evitar borrosidad en pantallas Retina. El tamaño lógico (que usan layout,
    // hit-testing y el resto del motor) se guarda como _logicalWidth/_logicalHeight.
    // Solo aplicamos una vez por canvas — re-llamadas a init no doble-escalan.
    if (!canvas._dprApplied) {
        var dpr = window.devicePixelRatio || 1;
        var logicalW = canvas.width;
        var logicalH = canvas.height;
        canvas._logicalWidth = logicalW;
        canvas._logicalHeight = logicalH;
        if (dpr !== 1) {
            canvas.width = Math.round(logicalW * dpr);
            canvas.height = Math.round(logicalH * dpr);
            canvas.style.width = logicalW + 'px';
            canvas.style.height = logicalH + 'px';
        }
        canvas._dpr = dpr;
        canvas._dprApplied = true;
    }

    this.context = canvas.getContext('2d');
    // El scale del contexto hace que todo el motor pueda seguir usando
    // coordenadas lógicas (1200x700) sin enterarse del escalado físico.
    if (canvas._dpr && canvas._dpr !== 1) {
        this.context.setTransform(canvas._dpr, 0, 0, canvas._dpr, 0, 0);
    }
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';

    this.width = canvas._logicalWidth || canvas.width;
    this.height = canvas._logicalHeight || canvas.height;

    if (!this.context) {
        console.error("Failed to get canvas context");
        return;
    }

    console.log("Canvas dimensions:", this.width, "x", this.height, "(dpr=" + (canvas._dpr || 1) + ")");
    this.drawSplash();
};

/**
 * Method to render odontograma
 * @param {type} data list of teeth for odontograma
 * @param {type} settings for the canvas
 * @param {type} constants which are used for the engine
 * @returns {undefined}
 */
Renderer.prototype.render = function (data, settings, constants) {
    "use strict";
    // Verificar que data es un array válido
    if (!Array.isArray(data)) {
        console.error("Invalid data for rendering, expected array but got:", typeof data);
        return;
    }
    
    // Eliminar log de depuración que podría interferir con la visualización
    // draw the teeth
    for (var i = 0; i < data.length; i++) {
        if (data[i] && typeof data[i].render === 'function') {
            try {
                data[i].render(this.context, settings, constants);
            } catch (error) {
                console.error("Error rendering item at index", i, error);
            }
        } else if (data[i]) {
            // Solo mostrar error si el elemento existe pero no tiene función render
            console.error("Invalid render item at index", i);
        }
    }
};

/**
 * Method to clear the canvas
 * @param {type} settings for color, and debug state
 * @returns {undefined}
 */
Renderer.prototype.clear = function (settings) {
    "use strict";
    // Re-aplicar el escalado HiDPI al comienzo de cada frame. A lo largo del motor
    // hay varios restore() sin un save() previo (legacy) que podrían dejar la
    // transform del contexto en estado inconsistente; este reset lo asegura.
    var canvas = this.context.canvas;
    var dpr = (canvas && canvas._dpr) || 1;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (settings.DEBUG) {
        this.context.fillStyle = "#e6fff3";
    } else {
        this.context.fillStyle = settings.COLOR_BG;
    }

    this.context.fillRect(0, 0, this.width, this.height);
};

/**
 * Method to render text on canvas
 * @param {type} text the text to render
 * @param {type} x position on canvas
 * @param {type} y position on canvas
 * @param {type} color the color which the text should be
 * @returns {undefined}
 */
Renderer.prototype.renderText = function (text, x, y, color) {
    "use strict";
    if (color === undefined) {
        color = this.settings ? this.settings.COLOR_TEXT : "#000000";
    }

    this.context.textAlign = 'left';
    this.context.fillStyle = color;
    this.context.fillText(text, x, y);
    this.context.restore();
};

Renderer.prototype.renderText14 = function (text, x, y, color) {
    "use strict";
    if (color === undefined) {
        color = this.settings ? this.settings.COLOR_TEXT : "#000000";
    }

    this.context.font = "14px Arial";

    this.context.textAlign = 'left';
    this.context.fillStyle = color;
    this.context.fillText(text, x, y);
    this.context.restore();
};


Renderer.prototype.renderNameValueTabbed = function (name, value, tab, x, y, color) {
    "use strict";

    this.context.font = "14px Arial";

    if (color === undefined) {
        color = this.settings ? this.settings.COLOR_TEXT : "#000000";
    }

    var text = name;

    for (var i = 0; i < tab; i++) {
        text += "\t";
    }

    text += value;

    this.context.textAlign = 'left';
    this.context.fillStyle = color;
    this.context.fillText(text, x, y);
    this.context.restore();
};

Renderer.prototype.renderTextCenter = function (text, x, y, color) {
    "use strict";
    if (color === undefined) {
        color = this.settings ? this.settings.COLOR_TEXT : "#000000";
    }



    this.context.textAlign = 'center';
    this.context.fillStyle = color;
    this.context.fillText(text, x, y);
    this.context.restore();
};

Renderer.prototype.renderTextCenter16 = function (text, x, y, color) {
    "use strict";
    if (color === undefined) {
        color = this.settings ? this.settings.COLOR_TEXT : "#000000";
    }

    this.context.font = "500 16px Montserrat, Arial, sans-serif";
    this.context.textAlign = 'center';
    this.context.fillStyle = color;
    this.context.fillText(text, x, y);
    this.context.restore();
};


/**
 * Method to set app settings to the renderer
 * @param {type} settings the settings for the application
 * @returns {undefined}
 */
Renderer.prototype.setSettings = function (settings) {
    "use strict";
    this.settings = settings;
};


/**
 * Method to change the size of the canvas
 * @param {type} width new width of the canvas
 * @param {type} height new height of the canvas
 * @returns {void} 
 */
Renderer.prototype.setCanvasSize = function (width, height) {
    "use strict";
    // Cambiar el tamaño físico del canvas resetea su transform — recomponemos
    // el escalado HiDPI para que las coordenadas lógicas sigan funcionando.
    var canvas = this.context.canvas;
    var dpr = canvas._dpr || 1;
    canvas._logicalWidth = width;
    canvas._logicalHeight = height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (dpr !== 1) {
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }
    if (dpr !== 1) {
        this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
    this.width = width;
    this.height = height;
};


Renderer.prototype.wrapText = function (text, x, y, maxWidth, lineHeight, maxLines) {

    var input = text.toString();

    var words = input.split(" ");

    var line = "";

    var lineNumber = 1;

    for (var n = 0; n < words.length; n++) {

        var testLine = line + words[n] + " ";

        var metrics = this.context.measureText(testLine);

        var testWidth = metrics.width;

        if (testWidth > maxWidth && n > 0) {

            this.renderText(line, x, y, this.settings.COLOR_TEXT);
            //this.context.fillText(line, x, y);

            line = words[n] + " ";

            y += lineHeight;

            lineNumber++;

        } else {

            line = testLine;

        }

        if (lineNumber > maxLines) {
            break;
        }
    }

    this.renderText(line, x, y, this.settings.COLOR_TEXT);
//    this.context.fillText(line, x, y);

};

Renderer.prototype.drawImage = function (src, x, y, width, height) {

    this.context.drawImage(src, x, y, width, height);

};

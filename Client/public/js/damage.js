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

/*
 * Class which represents a damange, which can be attaced to a tooth
 * and draw or written on a canvas
 */


function Damage(id, x, y, width, height, type) {
    "use strict";
    this.id = id;
    this.rect = new Rect();
    this.rect.x = x;
    this.rect.y = y;
    this.rect.width = width;
    this.rect.height = height;
    this.direction = -1; // 0 left, 1 right
    this.type = type;
    this.origin = "0";

}

Damage.prototype.setDiagnostic = function () {
    "use strict";
    this.origin = "1";
};

Damage.prototype.drawFractura = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        context.moveTo(this.rect.x,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height / 2);

    } else {

        context.moveTo(this.rect.x, this.rect.y);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height / 2);
    }

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_RED;
    context.stroke();
    context.restore();

};


Damage.prototype.drawDienteAusente = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        context.moveTo(this.rect.x, this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height * 0.25);

        context.lineWidth = 2;

        // set line color
        context.strokeStyle = settings.COLOR_BLUE;
        context.stroke();
        context.restore();

        context.moveTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x, this.rect.y + this.rect.height * 0.25);

        context.strokeStyle = settings.COLOR_BLUE;
        context.stroke();


    } else {


        context.moveTo(this.rect.x, this.rect.y);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height * 0.75);

        context.lineWidth = 2;

        // set line color
        context.strokeStyle = settings.COLOR_BLUE;
        context.stroke();
        context.restore();

        context.moveTo(this.rect.x + this.rect.width, this.rect.y);
        context.lineTo(this.rect.x, this.rect.y + this.rect.height * 0.75);

        context.strokeStyle = settings.COLOR_BLUE;
        context.stroke();

    }

    context.restore();
};

Damage.prototype.drawPulpar = function (context, settings) {
    "use strict";
    
    // Calculate dimensions based on tooth size
    const width = this.rect.width * 0.06; // Even thinner line for pulp
    const height = this.rect.height * 0.6;
    
    // Position based on tooth type (upper/lower)
    let x = this.rect.x + (this.rect.width - width) / 2;
    let y;
    
    if (this.type === 0) { // Upper tooth
        y = this.rect.y + this.rect.height - 90; // Align with implant position
    } else { // Lower tooth
        y = this.rect.y + this.rect.height - height - 2; // Align with implant bottom
    }

    context.save();
    
    if (this.type === 1) { // Flip for lower teeth
        context.translate(x + width/2, y + height/2);
        context.scale(1, -1);
        context.translate(-(x + width/2), -(y + height/2));
    }
    
    // Draw pulp line
    context.beginPath();
    context.rect(x, y, width, height);
    context.fillStyle = settings.COLOR_TEXT;
    context.fill();
    
    context.restore();
    
    // Fallback if drawing fails
    try {
        const point = context.isPointInPath(x, y);
        if (!point) {
            context.textAlign = "center";
            context.fillStyle = settings.COLOR_BLUE;
            context.fillText("PUL", this.rect.x + this.rect.width / 2,
                    this.rect.y + this.rect.height - 4);
        }
    } catch (error) {
        console.error("Error checking point in path:", error);
        // Fallback text
        context.textAlign = "center"; 
        context.fillStyle = settings.COLOR_BLUE;
        context.fillText("PUL", this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - 4);
    }
}

Damage.prototype.drawMigracion = function (context, settings) {
    "use strict";
    context.beginPath();

    var spacer = 5;

    if (this.type === 0) {

        // draw line
        context.moveTo(this.rect.x + spacer, this.rect.y - 5);
        context.lineTo(this.rect.x + this.rect.width - spacer, this.rect.y - 5);

        // upper point
        context.moveTo(this.rect.x + spacer, this.rect.y - 5);
        context.lineTo(this.rect.x + spacer + 4, this.rect.y - 10);

        // lower point
        context.moveTo(this.rect.x + spacer, this.rect.y - 5);
        context.lineTo(this.rect.x + spacer + 4, this.rect.y);

    } else {

        // draw line
        context.moveTo(this.rect.x + spacer,
                this.rect.y + this.rect.height + 5);

        context.lineTo(this.rect.x + this.rect.width - spacer,
                this.rect.y + this.rect.height + 5);

        // upper point
        context.moveTo(this.rect.x + this.rect.width - spacer,
                this.rect.y + this.rect.height + 5);

        context.lineTo(this.rect.x + this.rect.width - spacer - 4,
                this.rect.y + this.rect.height + 10);

        // upper point
        context.moveTo(this.rect.x + this.rect.width - spacer,
                this.rect.y + this.rect.height + 5);

        context.lineTo(this.rect.x + this.rect.width - spacer - 4,
                this.rect.y + this.rect.height);

    }

    context.lineWidth = 2;


    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();
    context.restore();

};

Damage.prototype.drawOrtondicoRemovible = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        // draw ZigZag
        context.moveTo(this.rect.x, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width / 2, this.rect.y - 10);
        context.lineTo(this.rect.x + this.rect.width, this.rect.y);

    } else {

        // draw ZigZag
        context.moveTo(this.rect.x, this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height + 10);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height);

    }

    context.lineWidth = 2;

    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();
    context.restore();

};

Damage.prototype.drawDienteExtruido = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        // draw arrow head
        context.moveTo(this.rect.x + 10, this.rect.y - 5);
        context.lineTo(this.rect.x + this.rect.width / 2, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width - 10, this.rect.y - 5);

        // draw arrow line
        context.moveTo(this.rect.x + this.rect.width / 2 - 1, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width / 2 - 1, this.rect.y - 15);


    } else {

        // draw arrow head
        context.moveTo(this.rect.x + 10,
                this.rect.y + this.rect.height + 5);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width - 10,
                this.rect.y + this.rect.height + 5);

        // draw arrow line
        context.moveTo(this.rect.x + this.rect.width / 2 - 1,
                this.rect.y + this.rect.height + 5);

        context.lineTo(this.rect.x + this.rect.width / 2 - 1,
                this.rect.y + this.rect.height + 15);
    }

    context.lineWidth = 3;

    // set line color
    context.strokeStyle = settings.COLOR_BLUE;
    context.fillStyle = settings.COLOR_BLUE;

    context.stroke();
    context.fill();
    context.restore();

};

Damage.prototype.drawDienteIntruido = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        // draw arrow head
        context.moveTo(this.rect.x + 10, this.rect.y - 10);
        context.lineTo(this.rect.x + this.rect.width / 2, this.rect.y - 15);
        context.lineTo(this.rect.x + this.rect.width - 10, this.rect.y - 10);

        // draw arrow line
        context.moveTo(this.rect.x + this.rect.width / 2 - 1, this.rect.y - 15);
        context.lineTo(this.rect.x + this.rect.width / 2 - 1, this.rect.y);


    } else {

        // draw arrow head
        context.moveTo(this.rect.x + 10,
                this.rect.y + this.rect.height + 10);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height + 15);

        context.lineTo(this.rect.x + this.rect.width - 10,
                this.rect.y + this.rect.height + 10);

        // draw arrow line
        context.moveTo(this.rect.x + this.rect.width / 2 - 1,
                this.rect.y + this.rect.height + 10);

        context.lineTo(this.rect.x + this.rect.width / 2 - 1,
                this.rect.y + this.rect.height);
    }

    context.lineWidth = 3;

    // set line color
    context.strokeStyle = settings.COLOR_BLUE;
    context.fillStyle = settings.COLOR_BLUE;

    context.stroke();
    context.fill();
    context.restore();

};

Damage.prototype.drawProtesisRemovible = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        // draw lower line
        context.moveTo(this.rect.x, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width, this.rect.y);

        // draw upper line
        context.moveTo(this.rect.x, this.rect.y - 10);
        context.lineTo(this.rect.x + this.rect.width, this.rect.y - 10);

    } else {

        // draw lower line
        context.moveTo(this.rect.x, this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height);

        // draw upper line
        context.moveTo(this.rect.x, this.rect.y + this.rect.height + 10);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height + 10);
    }

    context.lineWidth = 3;

    // set line color
    context.strokeStyle = settings.COLOR_BLUE;
    context.fillStyle = settings.COLOR_BLUE;

    context.stroke();
    context.fill();
    context.restore();

};

Damage.prototype.drawRemanenteRadicular = function (context, settings) {
    "use strict";
    context.beginPath();

    context.fillStyle = settings.COLOR_RED;
    context.textAlign = 'center';
    context.font = "600 20px Montserrat, Arial, sans-serif";

    if (this.type === 0) {
        context.fillText("RR", this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height / 2);
    } else {
        context.fillText("RR", this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height / 2);
    }

    context.font = "10px sans-serif";

    context.restore();

};

Damage.prototype.drawGiroversion = function drawGiroversion(context, settings) {
    "use strict";
    context.beginPath();

    var cx = this.rect.x + this.rect.width / 2;
    var cy = this.rect.y;
    var radius = (this.rect.width - 10) / 2;

    if (this.type === 0) {

        // half circle
        context.arc(cx, cy, radius, Math.PI, 2 * Math.PI, false);

        context.moveTo(this.rect.x + this.rect.width - 3, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width - 11, this.rect.y);

        context.moveTo(this.rect.x + this.rect.width - 3, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width - 3, this.rect.y - 8);

    } else {
        cy = this.rect.y + this.rect.height;
        // draw lower line
        context.arc(cx, cy, radius, Math.PI, 2 * Math.PI, true);

        context.moveTo(this.rect.x + 3,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + 11,
                this.rect.y + this.rect.height);

        context.moveTo(this.rect.x + 3,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + 3,
                this.rect.y + this.rect.height + 8);
    }


    context.lineWidth = 2;

    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();
    context.restore();

};

Damage.prototype.drawPernoMunon = function (context, settings) {
    "use strict";
    context.beginPath();

    var diff = 26;
    var size = this.rect.width - diff;

    if (this.type === 0) {
        // draw rectangle
        context.rect(this.rect.x + (diff / 2),
                this.rect.y + this.rect.height - (size / 2) - size,
                size,
                size);

        // draw line
        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - (size / 2) - size);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - (size / 2) - 50);

    } else {
        // draw rectangle
        context.rect(this.rect.x + (diff / 2),
                this.rect.y + (size / 2), size, size);

        // draw line
        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y + (size / 2) + size);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + (size / 2) + 50);
    }


    context.lineWidth = 2;

    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();
    context.restore();

};

Damage.prototype.drawDienteEnErupcion = function (context, settings) {
    "use strict";
    context.beginPath();

    var pad = 2;

    if (this.type === 0) {
        // draw arrow head
        context.moveTo(this.rect.x + pad, this.rect.y + this.rect.height - 6);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width - pad,
                this.rect.y + this.rect.height - 6);

        // draw zig zag
        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - 6);

        context.lineTo(this.rect.x + pad * 3,
                this.rect.y + this.rect.height - 12);

        context.lineTo(this.rect.x + this.rect.width - pad * 3,
                this.rect.y + this.rect.height - 24);

        context.lineTo(this.rect.x + pad * 3,
                this.rect.y + this.rect.height - 36);

        context.lineTo(this.rect.x + this.rect.width - pad * 3,
                this.rect.y + this.rect.height - 48);

        context.lineTo(this.rect.x + pad * 3,
                this.rect.y + this.rect.height - 60);

    } else {
        // draw arrow head
        context.moveTo(this.rect.x + pad, this.rect.y + 6);
        context.lineTo(this.rect.x + this.rect.width / 2, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width - pad, this.rect.y + 6);

        // draw zig zag
        context.moveTo(this.rect.x + this.rect.width / 2, this.rect.y);
        context.lineTo(this.rect.x + this.rect.width / 2, this.rect.y + 6);
        context.lineTo(this.rect.x + this.rect.width - pad * 3, this.rect.y + 12);
        context.lineTo(this.rect.x + pad * 3, this.rect.y + 24);
        context.lineTo(this.rect.x + this.rect.width - pad * 3, this.rect.y + 36);
        context.lineTo(this.rect.x + pad * 3, this.rect.y + 48);
        context.lineTo(this.rect.x + this.rect.width - pad * 3, this.rect.y + 60);
    }

    context.lineWidth = 3;

    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();
    context.restore();
};


Damage.prototype.drawEdentuloTotal = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        context.moveTo(this.rect.x, this.rect.y + this.rect.height - 20);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height - 20);

    } else {

        context.moveTo(this.rect.x, this.rect.y + 20);
        context.lineTo(this.rect.x + this.rect.width, this.rect.y + 20);
    }

    context.lineWidth = 3;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;
    context.stroke();
    context.restore();

};

/**
 * Draws a post (poste) symbol on the tooth
 * @param {CanvasRenderingContext2D} context - The canvas 2D rendering context
 * @param {Object} settings - Drawing settings object containing colors
 */
Damage.prototype.drawPoste = function (context, settings) {
    "use strict";
    
    // Start a new path
    context.beginPath();
    
    // Set unused space variable
    var space = 40;

    // Set line width to 3 pixels
    context.lineWidth = 3;

    // Set stroke color to blue from settings
    context.strokeStyle = settings.COLOR_BLUE;

    if (this.type === 0) { // For upper teeth
        // Start at bottom left
        context.moveTo(this.rect.x, this.rect.y + this.rect.height);

        // Draw line to middle point 30px up
        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - 30);

        // Draw line to bottom right
        context.lineTo(this.rect.x + this.rect.width, this.rect.y + this.rect.height);

    } else { // For lower teeth
        // Start at top left
        context.moveTo(this.rect.x, this.rect.y);
        
        // Draw line to middle point 30px down
        context.lineTo(this.rect.x + this.rect.width / 2, this.rect.y + 30);
        
        // Draw line to top right
        context.lineTo(this.rect.x + this.rect.width, this.rect.y);

    } 
    // Restore canvas state
    context.restore();
};

Damage.prototype.drawFusion = function (context, settings) {
    "use strict";

    var cx = this.rect.x + this.rect.width / 2;

    var radius = (this.rect.width + 5) / 2;

    context.beginPath();

    if (this.type === 0) {
        var cy = this.rect.y + this.rect.height * 3 / 4;

    } else {
        var cy = this.rect.y - 7;
    }

    context.ellipse(cx, cy, radius, radius - 15, 0, 0, 2 * Math.PI);

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;
    context.stroke();
    context.restore();

};

Damage.prototype.drawCoronaDefinitiva = function (context, settings) {
    "use strict";

    var cx = this.rect.x + this.rect.width / 2;
    var cy = 0;

    var radius = (settings.RECT_DIMEN * 3) / 2;

    context.beginPath();

    if (this.type === 0) {
        cy = this.rect.y + 16;
    } else {
        cy = this.rect.y + this.rect.height - 35;
    }

    context.ellipse(cx, cy, radius, radius, 0, 0, 2 * Math.PI);

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;
    context.stroke();
    context.restore();

};

Damage.prototype.drawCarilla = function (context, settings) {
    "use strict";

    var cx = this.rect.x + this.rect.width / 2;
    var cy = 0;

    var radius = (settings.RECT_DIMEN * 3) / 2;

    context.beginPath();

    if (this.type === 0) { // Superior teeth
        cy = this.rect.y + 16;
        // Draw semicircle with flat part at top
        context.moveTo(cx - radius, cy);
        context.arc(cx, cy, radius, 0, Math.PI, false); // Draw lower semicircle
        // Draw horizontal line at top
        context.moveTo(cx - radius, cy);
        context.lineTo(cx + radius, cy);
    } else { // Inferior teeth
        cy = this.rect.y + this.rect.height - 35;
        // Draw semicircle with flat part at bottom
        context.moveTo(cx - radius, cy);
        context.arc(cx, cy, radius, Math.PI, 0, false); // Draw upper semicircle
        // Draw horizontal line at bottom
        context.moveTo(cx - radius, cy);
        context.lineTo(cx + radius, cy);
    }

    context.lineWidth = 2;
    context.strokeStyle = settings.COLOR_BLUE;
    context.stroke();
    context.restore();
};

Damage.prototype.drawCoronaTemporal = function (context, settings) {
    "use strict";

    var cx = this.rect.x + this.rect.width / 2;
    var cy = 0;

    var radius = (settings.RECT_DIMEN * 3) / 2;

    context.beginPath();

    if (this.type === 0) {
        cy = this.rect.y + 16;
    } else {
        // Adjusted position for lower teeth to be higher up
        cy = this.rect.y + this.rect.height - 35; // Changed from -16 to -35
    }

    context.ellipse(cx, cy, radius, radius, 0, 0, 2 * Math.PI);

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_RED;
    context.stroke();
    context.restore();

};

Damage.prototype.drawDiastema = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        context.lineWidth = 2;
        // set line color
        context.strokeStyle = settings.COLOR_BLUE;

        context.beginPath();

        context.arc(this.rect.x + this.rect.width / 2 + 15,
                this.rect.y + this.rect.height / 2 + this.rect.height / 4,
                13,
                Math.PI * 0.5, // 90 degress
                Math.PI * 1.5, // 270 degrees
                false);

        context.stroke();

        context.beginPath();

        context.arc(this.rect.x + this.rect.width / 2 - 15,
                this.rect.y + this.rect.height / 2 + this.rect.height / 4,
                13,
                Math.PI * 0.5, // 90 degress
                Math.PI * 1.5, // 270 degrees
                true);

        context.stroke();

    } else {

        context.lineWidth = 2;
        // set line color
        context.strokeStyle = settings.COLOR_BLUE;

        context.beginPath();

        context.arc(this.rect.x + this.rect.width / 2 + 15,
                this.rect.y + this.rect.height / 4,
                13,
                Math.PI * 0.5, // 90 degress
                Math.PI * 1.5, // 270 degrees
                false);

        context.stroke();

        context.beginPath();

        context.arc(this.rect.x + this.rect.width / 2 - 15,
                this.rect.y + this.rect.height / 4,
                13,
                Math.PI * 0.5, // 90 degress
                Math.PI * 1.5, // 270 degrees
                true);

        context.stroke();
    }

    context.restore();

};

Damage.prototype.drawSuperNumerario = function (context, settings) {
    "use strict";
    context.beginPath();

    if (this.type === 0) {

        context.lineWidth = 2;
        // set line color
        context.strokeStyle = settings.COLOR_BLUE;

        context.beginPath();

        context.arc(this.rect.x + this.rect.width / 2,
                this.rect.y + 20,
                10,
                0, // 0 degress
                Math.PI * 2, // 360 degrees
                false);

        context.stroke();

        context.textAlign = 'center';
        context.fillStyle = settings.COLOR_BLUE;
        context.font = "600 16px Montserrat, Arial, sans-serif";
        context.fillText("S", this.rect.x + this.rect.width / 2, this.rect.y + 25);

        context.restore();

    } else {

        context.lineWidth = 2;
        // set line color
        context.strokeStyle = settings.COLOR_BLUE;

        context.beginPath();

        context.arc(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - 20,
                10,
                0, // 0 degress
                Math.PI * 2, // 360 degrees
                false);

        context.stroke();

        context.textAlign = 'center';
        context.fillStyle = settings.COLOR_BLUE;
        context.font = "600 16px Montserrat, Arial, sans-serif";

        context.fillText("S", this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - 15);

        context.restore();
    }

    context.restore();

};

Damage.prototype.drawOrtodonticoFijoEnd = function (context, settings) {
    "use strict";
    context.beginPath();
    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;

    if (this.type === 0) {

        context.rect(this.rect.x + 10,
                this.rect.y - this.rect.width + 20,
                this.rect.width - 20,
                this.rect.width - 20);

        context.stroke();

        context.beginPath();

        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y - this.rect.width + 25);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y - 5);

        context.stroke();

        context.moveTo(this.rect.x + 15,
                this.rect.y - ((this.rect.width - 20) / 2));

        context.lineTo(this.rect.x + this.rect.width - 15,
                this.rect.y - ((this.rect.width - 20) / 2));

        context.stroke();

    } else {


        context.rect(this.rect.x + 10,
                this.rect.y + this.rect.height,
                this.rect.width - 20,
                this.rect.width - 20);

        context.stroke();

        context.beginPath();

        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height + 5);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height + this.rect.width - 25);

        context.stroke();

        context.moveTo(this.rect.x + 15,
                this.rect.y + this.rect.height + ((this.rect.width - 20) / 2));

        context.lineTo(this.rect.x + this.rect.width - 15,
                this.rect.y + this.rect.height + ((this.rect.width - 20) / 2));

        context.stroke();

    }

    context.restore();

};

Damage.prototype.drawOrtodonticoFijoCenter = function (context, settings) {
    "use strict";
    context.beginPath();
    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;

    if (this.type === 0) {

        context.beginPath();

        context.moveTo(this.rect.x - 10,
                this.rect.y - ((this.rect.width - 20) / 2));

        context.lineTo(this.rect.x + this.rect.width + 10,
                this.rect.y - ((this.rect.width - 20) / 2));

        context.stroke();


    } else {

        context.beginPath();

        context.moveTo(this.rect.x - 10,
                this.rect.y + this.rect.height + ((this.rect.width - 20) / 2));

        context.lineTo(this.rect.x + this.rect.width + 10,
                this.rect.y + this.rect.height + ((this.rect.width - 20) / 2));

        context.stroke();

    }


    context.restore();

};

Damage.prototype.drawProtesisFijaRight = function (context, settings) {
    "use strict";
    context.beginPath();

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;

    if (this.type === 0) {

        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y - 15);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y - 15);

    } else {

        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height + 15);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height + 15);

    }

    context.stroke();
    context.restore();
};

Damage.prototype.drawProtesisFijaCenter = function (context, settings) {
    "use strict";
    context.beginPath();

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;

    if (this.type === 0) {

        context.moveTo(this.rect.x,
                this.rect.y - 15);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y - 15);

    } else {

        context.moveTo(this.rect.x,
                this.rect.y + this.rect.height + 15);

        context.lineTo(this.rect.x + this.rect.width,
                this.rect.y + this.rect.height + 15);

    }

    context.stroke();
    context.restore();
};

Damage.prototype.drawProtesisFijaLeft = function (context, settings) {
    "use strict";
    context.beginPath();

    context.lineWidth = 2;
    // set line color
    context.strokeStyle = settings.COLOR_BLUE;

    if (this.type === 0) {

        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y - 15);

        context.lineTo(this.rect.x,
                this.rect.y - 15);
    } else {

        context.moveTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height + 15);

        context.lineTo(this.rect.x,
                this.rect.y + this.rect.height + 15);

    }

    context.stroke();
    context.restore();
};

Damage.prototype.drawTransposicionLeft = function (context, settings) {
    "use strict";
    context.beginPath();

    var cx = this.rect.x + this.rect.width * 0.75;
    var cy = this.rect.y;
    var radiusX = (this.rect.width) / 2;
    var radiusY = 10;

    if (this.type === 0) {

        // half circle
        context.ellipse(cx, cy, radiusX, radiusY, 0, Math.PI, 2 * Math.PI, false);

        context.moveTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2),
                this.rect.y);

        context.lineTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2),
                this.rect.y - 8);

        context.moveTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2),
                this.rect.y);

        context.lineTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2) - 8,
                this.rect.y);

    } else {

        cy = this.rect.y + this.rect.height;

        // half circle
        context.ellipse(cx, cy, radiusX, radiusY, 0, Math.PI, 2 * Math.PI, true);

        context.moveTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2),
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2),
                this.rect.y + this.rect.height + 8);

        context.moveTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2),
                this.rect.y + this.rect.height);

        context.lineTo(this.rect.x + (this.rect.width * 0.75) + (this.rect.width / 2) - 8,
                this.rect.y + this.rect.height);
    }

    context.lineWidth = 2;

    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();

    context.restore();
};

Damage.prototype.drawTransposicionRight = function (context, settings) {
    "use strict";
    context.beginPath();

    var cx = this.rect.x + this.rect.width * 0.25;
    var cy = this.rect.y - 90; // Moved up 20 pixels
    var radiusX = (this.rect.width) / 2;
    var radiusY = 10;

    if (this.type === 0) {

        // half circle
        context.ellipse(cx, cy, radiusX, radiusY, 0, Math.PI, 2 * Math.PI, false);

        context.moveTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2),
                cy);

        context.lineTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2),
                cy - 8);

        context.moveTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2),
                cy);

        context.lineTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2) + 8,
                cy);

    } else {

        cy = this.rect.y + this.rect.height + 20; // Moved up 20 pixels

        // half circle
        context.ellipse(cx, cy, radiusX, radiusY, 0, Math.PI, 2 * Math.PI, true);

        context.moveTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2),
                cy);

        context.lineTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2),
                cy + 8);

        context.moveTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2),
                cy);

        context.lineTo(this.rect.x + (this.rect.width * 0.25) - (this.rect.width / 2) + 8,
                cy);
    }

    context.lineWidth = 2;

    context.strokeStyle = settings.COLOR_BLUE;

    context.stroke();
    context.restore();
};

Damage.prototype.drawDienteDiscomico = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("DIS", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();

};

Damage.prototype.drawDienteEctopico = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("E", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();

};

Damage.prototype.drawImpactacion = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("I", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();

};

// Create static image instance to avoid reloading
const implantImage = new Image();
implantImage.src = '/images/implante.png';

Damage.prototype.drawImplante = function (context, settings) {
    "use strict";
    
    // Calculate dimensions based on tooth size
    const width = this.rect.width * 0.8;
    const height = this.rect.height * 0.8;
    
    // Position based on tooth type (upper/lower)
    let x, y;
    if (this.type === 0) { // Upper tooth
        x = this.rect.x + (this.rect.width - width) / 2;
        y = this.rect.y + this.rect.height - 90; // Align to bottom
    } else { // Lower tooth
        x = this.rect.x + (this.rect.width - width) / 2;
        y = this.rect.y + this.rect.height - height - 2; // Align to bottom for lower teeth
    }

    // Check if image is loaded
    if (implantImage.complete) {
        context.save();
        
        if (this.type === 1) { // Flip image for lower teeth
            context.translate(x + width/2, y + height/2);
            context.scale(1, -1);
            context.translate(-(x + width/2), -(y + height/2));
        }
        
        // Create a clipping region for the implant body (excluding the tip)
        context.beginPath();
        context.rect(x, y, width, height * 0.8); // Increased clip height to 80%
        context.clip();
        
        // Draw background for implant body
        context.fillStyle = settings.COLOR_BG;
        context.fillRect(x, y, width, height);
        
        // Draw implant image
        context.drawImage(implantImage, x, y, width, height);
        
        context.restore();
        
        context.save();
        
        if (this.type === 1) { // Flip image for lower teeth
            context.translate(x + width/2, y + height/2);
            context.scale(1, -1);
            context.translate(-(x + width/2), -(y + height/2));
        }
        
        // Draw just the tip portion without background
        context.drawImage(
            implantImage,
            x, y + height * 0.8, // Source coordinates for bottom 20%
            width, height * 0.2,
            x, y + height * 0.8, // Destination coordinates
            width, height * 0.2
        );
        context.restore();
        
    } else {
        // Fallback to text if image not loaded
        context.textAlign = "center";
        context.fillStyle = settings.COLOR_BLUE;
        context.fillText("IMP", this.rect.x + this.rect.width / 2,
                this.rect.y + this.rect.height - 4);
        
        // Add one-time load handler
        implantImage.addEventListener('load', () => {
            this.drawImplante(context, settings);
        }, {once: true});
    }
};

Damage.prototype.drawMacrodoncia = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("MAC", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();

};

"use strict";

Damage.prototype.drawEndodoncia = function (context, settings) {
// Calculate dimensions based on tooth size
const width = this.rect.width * 0.06; // Even thinner line for pulp
const height = this.rect.height * 0.6;

// Position based on tooth type (upper/lower)
let x = this.rect.x + (this.rect.width - width) / 2;
let y;

if (this.type === 0) { // Upper tooth
    y = this.rect.y + this.rect.height - 90; // Align with implant position
} else { // Lower tooth
    y = this.rect.y + this.rect.height - height - 2; // Align with implant bottom
}

context.save();

if (this.type === 1) { // Flip for lower teeth
    context.translate(x + width/2, y + height/2);
    context.scale(1, -1);
    context.translate(-(x + width/2), -(y + height/2));
}

// Draw pulp line
context.beginPath();
context.rect(x, y, width, height);
context.fillStyle = "#FF8000";
context.fill();

context.restore();
};

Damage.prototype.drawMicrodonica = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("MIC", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();

};

Damage.prototype.drawSemiImpactaion = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("SI", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();

};

Damage.prototype.drawSuperficieDesgastada = function (context, settings) {
    "use strict";
    this.rect.highlightWithColor(context, settings.COLOR_BG, 1);

    context.textAlign = "center";
    context.fillStyle = settings.COLOR_BLUE;

    context.fillText("DES", this.rect.x + this.rect.width / 2,
            this.rect.y + this.rect.height - 4);

    context.restore();


};

Damage.prototype.render = function (context, settings, constants) {
    "use strict";

    if (this.origin === "0") {

        if (this.id === constants.FRACTURA) {
            this.drawFractura(context, settings);
        }

        if (this.id === constants.DIENTE_AUSENTE) {
            this.drawDienteAusente(context, settings);
        }

        if (this.id === constants.PULPAR) {
            this.drawPulpar(context, settings);
        }

        if (this.id === constants.MIGRACION) {
            this.drawMigracion(context, settings);
        }

        if (this.id === constants.ENDODONCIA) {
            this.drawEndodoncia(context, settings);
        }

        if (this.id === constants.DIENTE_EXTRUIDO) {
            this.drawDienteExtruido(context, settings);
        }

        if (this.id === constants.DIENTE_INTRUIDO) {
            this.drawDienteIntruido(context, settings);
        }

        if (this.id === constants.PROTESIS_REMOVIBLE) {
            this.drawProtesisRemovible(context, settings);
        }

        if (this.id === constants.REMANENTE_RADICULAR) {
            this.drawRemanenteRadicular(context, settings);
        }

        if (this.id === constants.GIROVERSION) {
            this.drawGiroversion(context, settings);
        }

        if (this.id === constants.PERNO_MUNON) {
            this.drawPernoMunon(context, settings);
        }

        if (this.id === constants.DIENTE_EN_ERUPCION) {
            this.drawDienteEnErupcion(context, settings);
        }

        if (this.id === constants.CARILLA) {
            this.drawCarilla(context, settings);
        }

        if (this.id === constants.EDENTULOA_TOTAL) {
            this.drawEdentuloTotal(context, settings);
        }

        if (this.id === constants.POSTE) {
            this.drawPoste(context, settings);
        }

        if (this.id === constants.FUSION) {
            this.drawFusion(context, settings);
        }

        if (this.id === constants.CORONA_DEFINITIVA) {
            this.drawCoronaDefinitiva(context, settings);
        }

        if (this.id === constants.CORONA_TEMPORAL) {
            this.drawCoronaTemporal(context, settings);
        }

        if (this.id === constants.DIASTEMA) {
            this.drawDiastema(context, settings);
        }

        if (this.id === constants.SUPER_NUMERARIO) {
            this.drawSuperNumerario(context, settings);
        }

        if (this.id === constants.ORTODONTICO_FIJO_END) {
            this.drawOrtodonticoFijoEnd(context, settings);
        }

        if (this.id === constants.ORTODONTICO_FIJO_CENTER) {
            this.drawOrtodonticoFijoCenter(context, settings);
        }

        if (this.id === constants.PROTESIS_FIJA_RIGHT) {
            this.drawProtesisFijaRight(context, settings);
        }

        if (this.id === constants.PROTESIS_FIJA_CENTER) {
            this.drawProtesisFijaCenter(context, settings);
        }

        if (this.id === constants.PROTESIS_FIJA_LEFT) {
            this.drawProtesisFijaLeft(context, settings);
        }

        if (this.id === constants.TRANSPOSICION_LEFT) {
            this.drawTransposicionLeft(context, settings);
        }

        if (this.id === constants.TRANSPOSICION_RIGHT) {
            this.drawTransposicionRight(context, settings);
        }

        if (this.id === constants.DIENTE_DISCR0MICO) {
            this.drawDienteDiscomico(context, settings);
        }

        if (this.id === constants.IMPACTACION) {
            this.drawImpactacion(context, settings);
        }

        if (this.id === constants.DIENTE_ECTOPICO) {
            this.drawDienteEctopico(context, settings);
        }

        if (this.id === constants.IMPLANTE) {
            this.drawImplante(context, settings);
        }

        if (this.id === constants.MACRODONCIA) {
            this.drawMacrodoncia(context, settings);
        }

        if (this.id === constants.MICRODONCIA) {
            this.drawMicrodonica(context, settings);
        }

        if (this.id === constants.SEMI_IMPACTACI0N) {
            this.drawSemiImpactaion(context, settings);
        }

        if (this.id === constants.SUPERFICIE_DESGASTADA) {
            this.drawSuperficieDesgastada(context, settings);
        }
    
    } else {
        
        console.log("Will render diagnostic");
        
    }

    if (settings.DEBUG) {
        this.rect.highlight(context, settings);
    }
};



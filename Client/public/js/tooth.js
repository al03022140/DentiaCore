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

// -----------------
// Upper mouth = 0
// Lower mouth = 1;
// -----------------


/**
 * Base class for tooth
 * @returns {Tooth}
 */
function Tooth() {
    "use strict";
    this.id = 0;
    this.tooth = true;
    this.surfaces = 0;
    this.highlight = false;
    this.highlightColor = "";
    this.damages = Array();
    this.checkBoxes = Array();
    this.rect = new Rect();
    this.textBox = new TextBox();
    this.spacer = 20; // spacer to seperate tooth from surfaces
    this.touching = false;
    this.address = 0;
    this.normalY = null;
    this.highY = null;
    this.blocked = false;
    this.constants = null;

}

/**
 * Add a damage to this tooth
 * @param {string} damageId - The damage ID
 * @param {string} surface - The surface ID (optional)
 * @param {string} note - Note text (optional)
 * @returns {Damage} The created damage object or null if duplicate
 */
Tooth.prototype.addDamage = function(damageId, surface, note, fecha) {
    "use strict";
    
    // Check for duplicate damage
    var isDuplicate = this.damages.some(function(existingDamage) {
        // Compare damage ID
        if (existingDamage.id !== damageId) {
            return false;
        }
        
        // If both have surfaces, compare them
        if (surface && existingDamage.surface) {
            return existingDamage.surface === surface;
        }
        
        // If neither has surface, it's a duplicate
        if (!surface && !existingDamage.surface) {
            return true;
        }
        
        // If only one has surface, not a duplicate
        return false;
    });
    
    // If duplicate found, return null without adding
    if (isDuplicate) {
        console.warn('Duplicate damage detected:', {
            toothId: this.id,
            damageId: damageId,
            surface: surface || 'none'
        });
        return null;
    }
    
    // Create the damage object
    var damage = this.createDamage(damageId);
    
    if (damage) {
        // Set additional properties if provided
        if (surface) {
            damage.surface = surface;
        }
        
        if (note) {
            damage.note = note;
        }
        
        // Set fecha if provided, otherwise use current date
    if (fecha) {
        damage.fecha = formatDateToDDMMYYYY(fecha);
    } else {
        damage.fecha = getCurrentDateFormatted();
    }
        
        // Add to damages array
        this.damages.push(damage);
        
        return damage;
    }
    
    return null;
};

/**
 * Method to set up position and dimension of the Tooth
 * @param {type} x position
 * @param {type} y position
 * @param {type} width 
 * @param {type} height
 * @returns {undefined}
 */
Tooth.prototype.setDimens = function (x, y, width, height) {
    "use strict";

    this.y = y; // y variable to help with animations, on mouse hover

    this.rect.x = x;
    this.rect.y = y;
    this.rect.width = width;
    this.rect.height = height;

    this.normalY = y;

    this.textBox.setDimens(x, y, width, 20);

    this.textBox.setLabel(this.id);

};

/**
 * Method to set the type of the tooth
 * @param {type} type of the tooth, upper or lower
 * @returns {undefined}
 */
Tooth.prototype.setType = function (type) {
    "use strict";

    this.type = type;

    if (type === 0) {
        this.highY = this.rect.y - 10;

        this.textBox.rect.y = this.rect.y - 42;

    } else {
        this.highY = this.rect.y + 10;

        this.textBox.rect.y = this.rect.y + this.rect.height + 22;
    }

};

/**
 * Method to set a reference to constants
 * @param {type} constants
 * @returns {undefined}
 */
Tooth.prototype.setConstants = function (constants) {
    "use strict";
    this.constants = constants;
};

/**
 * Method to check for collision
 * @param {type} eX x coordinates of event
 * @param {type} eY y coordinates of event
 * @returns boolean true if collision, else false
 */
Tooth.prototype.checkCollision = function (eX, eY) {
    "use strict";
    return this.rect.checkCollision(eX, eY);
};

/**
 * Method to set surfaces for the tooth, 4 or 5
 * @param {type} surfaces
 * @returns {undefined}
 */
Tooth.prototype.setSurfaces = function (surfaces) {
    "use strict";
    this.surfaces = surfaces;
};

Tooth.prototype.toggleSelected = function (selected) {
    "use strict";
    this.highlight = selected;
};

/**
 * Method to create 4 surfaces for the tooth, 5 checkboxes
 * @param {type} settings global settings 
 * @returns {undefined}
 */
Tooth.prototype.create4Surfaces = function (settings) {
    "use strict";
    var width = settings.RECT_DIMEN;

    var startX = this.rect.x + 10;

    /*
     * ids are in the following order
     *
     * upper
     *   1
     * 2   4
     *   3
     * lower
     *   3
     * 4   2
     *   1
     */

    if (this.type === 0) {

        var rect1 = new Rect();

        rect1.width = width;
        rect1.height = width;
        rect1.x = startX;
        rect1.y = this.rect.y + this.rect.height + width;
        rect1.id = this.id + "_M";

        this.checkBoxes.push(rect1);

        var rect2 = new Rect();

        rect2.width = width;
        rect2.height = width;
        rect2.x = startX + width;
        rect2.y = this.rect.y + this.rect.height + width;
        rect2.id = this.id + "_D";

        this.checkBoxes.push(rect2);

        var rect3 = new Rect();

        rect3.width = width;
        rect3.height = width;
        rect3.x = startX + 5;
        rect3.y = this.rect.y + this.rect.height;
        rect3.id = this.id + "_V";

        this.checkBoxes.push(rect3);

        var rect4 = new Rect();

        rect4.width = width;
        rect4.height = width;
        rect4.x = startX + 5;
        rect4.y = this.rect.y + this.rect.height + width * 2;
        rect4.id = this.id + "_L";

        this.checkBoxes.push(rect4);

    } else {

        var rect1 = new Rect();

        rect1.width = width;
        rect1.height = width;
        rect1.x = startX;
        rect1.y = this.rect.y - width * 2;
        rect1.id = this.id + "_M";

        this.checkBoxes.push(rect1);

        var rect2 = new Rect();

        rect2.width = width;
        rect2.height = width;
        rect2.x = startX + width;
        rect2.y = this.rect.y - width * 2;
        rect2.id = this.id + "_D";

        this.checkBoxes.push(rect2);

        var rect3 = new Rect();

        rect3.width = width;
        rect3.height = width;
        rect3.x = startX + 5;
        rect3.y = this.rect.y - width;
        rect3.id = this.id + "_L";

        this.checkBoxes.push(rect3);

        var rect4 = new Rect();

        rect4.width = width;
        rect4.height = width;
        rect4.x = startX + 5;
        rect4.y = this.rect.y - width * 3;
        rect4.id = this.id + "_V";

        this.checkBoxes.push(rect4);

    }

};

/**
 * Method to create 4 surfaces for the tooth, 5 checkboxes
 * @param {type} settings global settings 
 * @returns {undefined}
 */
Tooth.prototype.create5Surfaces = function (settings) {
    "use strict";
    var width = settings.RECT_DIMEN;

    var startX = this.rect.x + 5;

    /*
     * ids are in the following order
     * 
     * upper
     *   1
     * 2 5 4
     *   3
     *   
     * lower
     *   3
     * 4 5 2
     *   1  
     */

    if (this.type === 0) {

        var rect1 = new Rect();

        rect1.width = width;
        rect1.height = width;
        rect1.x = startX;
        rect1.y = this.rect.y + this.rect.height + width;
        rect1.id = this.id + "_M";

        this.checkBoxes.push(rect1);

        var rect2 = new Rect();

        rect2.width = width;
        rect2.height = width;
        rect2.x = startX + width;
        rect2.y = this.rect.y + this.rect.height + width;
        rect2.id = this.id + "_0";

        this.checkBoxes.push(rect2);

        var rect3 = new Rect();

        rect3.width = width;
        rect3.height = width;
        rect3.x = startX + width * 2;
        rect3.y = this.rect.y + this.rect.height + width;
        rect3.id = this.id + "_D";

        this.checkBoxes.push(rect3);

        var rect4 = new Rect();

        rect4.width = width;
        rect4.height = width;
        rect4.x = startX + width;
        rect4.y = this.rect.y + this.rect.height;
        rect4.id = this.id + "_V";

        this.checkBoxes.push(rect4);

        var rect5 = new Rect();

        rect5.width = width;
        rect5.height = width;
        rect5.x = startX + width;
        rect5.y = this.rect.y + this.rect.height + width * 2;
        rect5.id = this.id + "_L";

        this.checkBoxes.push(rect5);

    } else {

        var rect1 = new Rect();

        rect1.width = width;
        rect1.height = width;
        rect1.x = startX;
        rect1.y = this.rect.y - width * 2;
        rect1.id = this.id + "_M";

        this.checkBoxes.push(rect1);

        var rect2 = new Rect();

        rect2.width = width;
        rect2.height = width;
        rect2.x = startX + width;
        rect2.y = this.rect.y - width * 2;
        rect2.id = this.id + "_0";

        this.checkBoxes.push(rect2);

        var rect3 = new Rect();

        rect3.width = width;
        rect3.height = width;
        rect3.x = startX + width * 2;
        rect3.y = this.rect.y - width * 2;
        rect3.id = this.id + "_D";

        this.checkBoxes.push(rect3);

        var rect4 = new Rect();

        rect4.width = width;
        rect4.height = width;
        rect4.x = startX + width;
        rect4.y = this.rect.y - width;
        rect4.id = this.id + "_L";

        this.checkBoxes.push(rect4);

        var rect5 = new Rect();

        rect5.width = width;
        rect5.height = width;
        rect5.x = startX + width;
        rect5.y = this.rect.y - width * 3;
        rect5.id = this.id + "_V";

        this.checkBoxes.push(rect5);

    }

};

/**
 * Base method for setting the surfaces for a tooth
 * @param {type} settings global settings 
 * @returns {undefined}
 */
Tooth.prototype.createSurfaces = function (settings) {
    "use strict";
    if (this.surfaces === 4) {
        this.create4Surfaces(settings);
    } else {
        this.create5Surfaces(settings);
    }
};

/**
 * Method to draw the id for the tooth
 * @param {type} context the canvas to draw on
 * @returns {undefined}
 */
Tooth.prototype.drawId = function (context) {
    "use strict";
    context.beginPath();
    context.textAlign = 'center';
    context.fillStyle = "#000000";
    context.font = "500 15px Montserrat, Arial, sans-serif";

    var space = 40;

    if (this.type === 0) {

        // draw id
        context.fillText("" + this.id, this.rect.x + this.rect.width / 2,
                this.y + this.rect.height + space + 10);

        // draw id border
        context.moveTo(this.rect.x, this.y + this.rect.height + space + 20);

        context.lineTo(this.rect.x + this.rect.width,
                this.y + this.rect.height + space + 20);

        context.moveTo(this.rect.x + this.rect.width,
                this.y + this.rect.height + space + 20);

        context.lineTo(this.rect.x + this.rect.width,
                this.y + this.rect.height + space);
    } else {

        // draw id
        context.fillText("" + this.id, this.rect.x + this.rect.width / 2,
                this.y - space - 5);

        // draw id border
        context.moveTo(this.rect.x, this.y - space - 20);
        context.lineTo(this.rect.x + this.rect.width, this.y - space - 20);

        context.moveTo(this.rect.x + this.rect.width, this.y - space - 20);
        context.lineTo(this.rect.x + this.rect.width, this.y - space);
    }

    context.lineWidth = 1;
    // set line color
    context.strokeStyle = '#000000';
    context.stroke();
    context.restore();

};

/**
 * Method to draw the checkboxes for the tooth
 * @param {type} context the canvas to draw on
 * @param {type} settings global settings
 * @returns {undefined}
 */
Tooth.prototype.drawCheckBoxes = function (context, settings) {
    "use strict";

    for (var i = 0; i < this.checkBoxes.length; i++)
    {

        if (this.checkBoxes[i].state === 1) {

            this.checkBoxes[i].fillColor(context, settings.COLOR_RED);
            this.checkBoxes[i].outline(context, "#000000");


        } else if (this.checkBoxes[i].state === 11) {

            this.checkBoxes[i].fillColor(context, settings.COLOR_BLUE);
            this.checkBoxes[i].outline(context, "#000000");

        } else {

            this.checkBoxes[i].outline(context, "#000000");

        }

    }
};

/**
 * Method to draw a text box for the tooth
 * @param {type} context the canvas to draw on
 * @param {type} settings global settings
 * @returns {undefined} void
 */
Tooth.prototype.drawTextBox = function (context, settings) {
    "use strict";

    this.textBox.render(context, settings.COLOR_BLUE);

    if (this.textBox.touching) {
        this.textBox.rect.highlightWithColor(context, "#36BE1B", 0.6);
    }

};

/**
 * Method to toggle Touchin on / off
 * @param {type} touch boolean value 
 * @returns {undefined}
 */
Tooth.prototype.onTouch = function (touch) {
    "use strict";

    if (this.tooth) {
        
        if (touch)
        {
            this.rect.y = this.highY;

        } else {
            this.rect.y = this.normalY;
        }
   
    }
    
    this.rect.touching = touch;
};

/**
 * Method to generate a damage for the tooth.
 * @param {type} damageId the id of the damage to create
 * @returns {Damage} damage which can be drawn
 */
Tooth.prototype.createDamage = function (damageId) {
    "use strict";
    
    const createDamageObject = (x, y, width, height, type) => {
        return new Damage(damageId, x, y, width, height, type);
    };

    if (this.constants.isDiagnostic(damageId)) {
        // Check if damage should be positioned in checkboxes area
        const isSpecialDamage = [
            this.constants.DIENTE_EN_CLAVIJA,
            this.constants.FUSION,
            this.constants.CORONA_DEFINITIVA,
            this.constants.CARILLA,
            this.constants.CORONA_TEMPORAL
        ].includes(damageId);

        if (isSpecialDamage) {
            // Position damage based on tooth type
            const damage = this.type === 0 
                ? createDamageObject(this.rect.x, this.y + this.rect.height, this.rect.width, 60, this.type)
                : createDamageObject(this.rect.x, this.y - 42, this.rect.width, 60, this.type);
            damage.origin = "0"; // Asegurar que se dibuje
            return damage;
        } 
        
        if (this.constants.isWritable(damageId)) {
            // Attach damage to textBox area
            const damage = createDamageObject(
                this.textBox.rect.x,
                this.textBox.rect.y,
                this.textBox.rect.width,
                this.textBox.rect.height,
                this.type
            );
            damage.origin = "0"; // Asegurar que se dibuje
            return damage;
        }
        
        // Attach damage on the tooth
        const damage = createDamageObject(
            this.rect.x,
            this.y,
            this.rect.width,
            this.rect.height,
            this.type
        );
        damage.origin = "0"; // Asegurar que se dibuje
        return damage;
    }

    // Handle non-diagnostic damage
    const damage = this.type === 0
        ? createDamageObject(this.rect.x, this.y + this.rect.height, this.rect.width, 60, this.type)
        : createDamageObject(this.rect.x, this.y - 60, this.rect.width, 60, this.type);

    // Establecer origin = "0" para asegurar que el daño se dibuje correctamente
    // Esto es necesario para que el daño se visualice en el odontograma
    damage.origin = "0";
    return damage;
};

/**
 * Method to toggle damage on a tooth on off
 * @param {type} damageId to add or remove
 * @returns {undefined}
 */
Tooth.prototype.toggleDamage = function (damageId) {
    "use strict";
    console.log("Toggle damage for " + this.id + ", damage " + damageId);

    // Check if damage already exists
    var existingIndex = -1;
    for (var i = 0; i < this.damages.length; i++) {
        if (this.damages[i].id === damageId) {
            existingIndex = i;
            break;
        }
    }

    if (existingIndex !== -1) {
        // Damage exists, remove it
        console.log("Removing existing damage for tooth " + this.id);
        this.damages.splice(existingIndex, 1);
    } else {
        // Damage doesn't exist, add it using addDamage (which handles duplicates)
        // Pasamos la fecha actual para registrar cuándo se agregó el daño
    var currentDate = getCurrentDateFormatted();
        this.addDamage(damageId, null, "", currentDate);
    }
};


/**
 * Method to render a Tooth on the screen with all its states
 * @param {type} context the canvas to draw on
 * @param {type} settings app settings
 * @param {type} constants application constants
 * @returns {undefined}
 */
Tooth.prototype.render = function (context, settings, constants) {
    "use strict";
    // check if this is a tooth or a space
    if (this.tooth) {

        this.textBox.drawLabel(context);

        // draw the image of the tooth
        if (this.image !== undefined) {

            // center of tooth
            var cx = (this.rect.x + this.rect.width / 2);

            // centerinng of the tooth in x axis
            var dx = cx - this.image.naturalWidth / 2;

            // draw tooth
            context.drawImage(this.image, dx, this.rect.y);
        }

        // id
        this.drawId(context);

        // checkboxes
        this.drawCheckBoxes(context, settings);

        if (this.highlight) {
            this.rect.highlightWithColor(context, this.highlightColor, 0.3);
        }

    } else {

        // highlight the spaces between the teeths
        if (settings.HIHGLIGHT_SPACES) {

            if (this.rect.touching) {
                this.rect.highlightEllipse(context, "#00AEFF", 0.5, -10);
            } else {
                this.rect.highlightEllipse(context, "#19B900", 0.2, 10);
            }
        }
    }

    // draw all damages
    for (var i = 0; i < this.damages.length; i++) {
        this.damages[i].render(context, settings, constants);
    }

    // highlight textboxes
    for (var i = 0; i < this.checkBoxes.length; i++)
    {
        if (this.checkBoxes[i].touching)
        {
            this.checkBoxes[i].highlightWithColor(context, "#36BE1B", 0.6);
        }

    }

    // Draw textboxes
    if (this.tooth) {
        this.drawTextBox(context, settings);

    }

    // show area of tooth or space, only in DEBUG MODE
    if (settings.DEBUG) {

        if (this.tooth) {
            this.rect.outline(context, "#000000");
        } else {
            this.rect.highlightEllipse(context, "#FFD100", 0.4, 2);
        }
    }

};

/**
 * Method to get a surface (checkbox) by id
 * @param {type} id the id of the textbox to find
 * @returns returns a rect if found, else undefined
 */
Tooth.prototype.getSurfaceById = function (id) {
    "use strict";
    var surface;

    for (var i = 0; i < this.checkBoxes.length; i++) {

        if (this.checkBoxes[i].id === id) {

            surface = this.checkBoxes[i];
            break;
        }
    }

    return surface;
};

/**
 * Metod to move a tooth up and down the Y axis
 * @param {type} movement amount of pixels to move the tooth
 * @returns {void}
 */
Tooth.prototype.moveUpDown = function (movement) {

    this.normalY += movement;
    this.y += movement;
    this.rect.y += movement;

    this.textBox.rect.y += movement;

    for (var i = 0; i < this.checkBoxes.length; i++) {
        this.checkBoxes[i].y += movement;
    }

    for (var i = 0; i < this.damages.length; i++) {
        this.damages[i].rect.y += movement;
    }

};

/**
 * Method to pop the last item of the damages array
 * @returns {void}
 */
Tooth.prototype.popDamage = function () {

    let tail = this.damages.length - 1; // last item

    if (tail >= 0) {
        this.damages.splice(tail, 1);
    }

};

Tooth.prototype.refresh = function (constants) {

    for (var i = 0; i < this.damages.length; i++) {

        if (this.constants.isWritable(this.damages[i].id)) {

            // damage should be attached to the textBox area
            this.damages[i].rect.x = this.textBox.rect.x;
            this.damages[i].rect.y = this.textBox.rect.y;

        }
    }

    this.rect.y = this.normalY;
    this.touching = false;

    this.textBox.touching = false;

    for (var i = 0; i < this.checkBoxes.length; i++) {
        this.checkBoxes[i].touching = false;
    }

};
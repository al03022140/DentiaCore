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

// include the necessary scripts
/*
document.writeln("<script type='text/javascript' src='js/constants.js'></script>");
document.writeln("<script type='text/javascript' src='js/settings.js'></script>");
document.writeln("<script type='text/javascript' src='js/rect.js'></script>");
document.writeln("<script type='text/javascript' src='js/damage.js'></script>");
document.writeln("<script type='text/javascript' src='js/textBox.js'></script>");
document.writeln("<script type='text/javascript' src='js/tooth.js'></script>");
document.writeln("<script type='text/javascript' src='js/menuItem.js'></script>");
document.writeln("<script type='text/javascript' src='js/renderer.js'></script>");
document.writeln("<script type='text/javascript' src='js/odontogramaGenerator.js'></script>");
document.writeln("<script type='text/javascript' src='js/collisionHandler.js'></script>");
*/

function Engine(config) {
    "use strict";
    // canvas which is used by the engine
    this.canvas = null;

    this.hasSavedInitialOdontogram = false;

    this.adultShowing = true;

    // array which contains all the teeth for an odontograma
    this.mouth = [];

    // array which holds all the spaces between teeth
    this.spaces = [];

    // array for an adult odontograma
    this.odontAdult = [];

    // spaces for a adult odontograma
    this.odontSpacesAdult = [];

    // array for a child odontograma
    this.odontChild = [];

    // spaces for a child odontograma
    this.odontSpacesChild = [];

    // renderer which will render everything on a canvas
    this.renderer = new Renderer();

    // helper to create odontograma
    this.odontogramaGenerator = new OdontogramaGenerator();

    // helper for handeling collision
    this.collisionHandler = new CollisionHandler();

    // settings for application
    this.settings = new Settings();

    // constants for application
    this.constants = new Constants();

    // value of the selected damage which should be added or removed
    this.selectedDamage = 0;

    // x position of the mouse pointer
    this.cursorX = 0;

    // y position of the mouse pointer
    this.corsorY = 0;

    // flag to toggle multiselection on or off
    this.multiSelect = false;

    // array to hold values for multiselection. When selecting 
    // a range of teeth
    this.multiSelection = [];

    this.currentType = 0;

    this.preview = false;

    this.printPreviewPositionChange = 190;

    this.observations = "";

    this.specifications = "";

    this.patient = "";

    this.treatmentNumber = "";

    this.treatmentData = {};

    this.menuItems = [];

    this.buttons = []

    this.adult = new MenuItem()

    this.child = new MenuItem()

    this.clear = new MenuItem()
    
    // Tipo de odontograma (inicial o clinico)
    this.tipo = "clinico";
    
    // ID del paciente asociado al odontograma
    this.patientId = "";

}

/**
 * Method to set the canvas for the engine.
 * @param {type} canvas the canvas which will be used for drawing
 * @returns {undefined}
 */
Engine.prototype.setCanvas = function (canvas) {
    "use strict";
    console.log("Engine: setting canvas: " + canvas);
    console.log("Engine: canvas size (" + canvas.width + ", " + canvas.height + ")");
    
    // Detectar automáticamente el tipo basado en el ID del canvas
    if (canvas && canvas.id) {
        if (canvas.id === 'odontograma-canvas') {
            this.tipo = 'inicial';
            console.log("Engine: Tipo detectado automáticamente: inicial");
        } else if (canvas.id === 'odontograma-canvas-2') {
            this.tipo = 'clinico';
            console.log("Engine: Tipo detectado automáticamente: clinico");
        } else {
            console.log("Engine: ID de canvas no reconocido (" + canvas.id + "), manteniendo tipo actual: " + this.tipo);
        }
    } else {
        console.log("Engine: Canvas sin ID, manteniendo tipo actual: " + this.tipo);
    }
    
    this.canvas = canvas;
    this.renderer.init(this.canvas);
};

/**
 * Helper method to get the real x position of mouse
 * @param {type} event mouse event containing mouse position
 * @returns {Number} the x position of the mouse
 */
Engine.prototype.getXpos = function (event) {
    "use strict";
    var boundingRect = this.canvas.getBoundingClientRect();

    return Math.round(event.clientX - (boundingRect.left));
};

/**
 * Helper method to get the real y position of mouse
 * @param {type} event mouse event containing mouse position
 * @returns {Number} the y position of the mouse
 */
Engine.prototype.getYpos = function (event) {
    "use strict";
    var boundingRect = this.canvas.getBoundingClientRect();

    return Math.round(event.clientY - (boundingRect.top));
};

/**
 * Method to prepare the engine
 * @returns {undefined}
 */
Engine.prototype.init = function () {
    "use strict";
    this.collisionHandler.setConstants(this.constants);

    // set up the odontograma
    this.odontogramaGenerator.setEngine(this);

    this.odontogramaGenerator.setSettings(this.settings);

    this.odontogramaGenerator.setConstants(this.constants);

    this.odontogramaGenerator.prepareOdontogramaAdult(this.odontAdult,
        this.odontSpacesAdult, this.canvas);

    this.odontogramaGenerator.prepareOdontogramaChild(this.odontChild,
        this.odontSpacesChild, this.canvas);

    this.mouth = this.odontAdult;

    this.spaces = this.odontSpacesAdult;

    this.createMenu()


    this.adult = new MenuItem();
    this.adult.setUp(10, 150, 75, 20);
    this.adult.textBox.text = "Adulto";
    this.adult.active = true;
    this.buttons.push(this.adult);

    this.child = new MenuItem();
    this.child.setUp(90, 150, 75, 20);
    this.child.textBox.text = "Niño";
    this.child.active = false;
    this.buttons.push(this.child);

    this.save = new MenuItem();
    this.save.setUp((this.canvas.width-10) - 160, 150, 75, 20);
    this.save.textBox.text = "Guardar";
    this.save.active = false;
    this.buttons.push(this.save);
    
    this.clear = new MenuItem();
    this.clear.setUp((this.canvas.width-10) - 76, 150, 75, 20);
    this.clear.textBox.text = "Reset";
    this.clear.active = false;
    this.buttons.push(this.clear);

    // Watch for theme changes and re-detect colors
    var self = this;
    this._themeObserver = new MutationObserver(function () {
        self.settings.detectTheme();
    });
    this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

};

/**
 * Alias para inicializar el odontograma (mismo comportamiento que init)
 */
Engine.prototype.initMouth = function() {
  "use strict";
  // Si tu init() ya hace todo lo que necesitas para mostrar la boca,
  // simplemente lo llamas:
  this.init();

  // (Opcional) Forzar un primer render:
  this.update();
};

/**
 * Method for updating the engine
 * @returns {undefined}
 */
Engine.prototype.update = function () {
    "use strict";
    this.renderer.clear(this.settings);

    if (!this.preview) {
        this.renderer.render(this.mouth, this.settings, this.constants);

        this.renderer.render(this.spaces, this.settings, this.constants);

        this.renderer.render(this.menuItems, this.settings, this.constants);

        this.renderer.render(this.buttons, this.settings, this.constants);

        if (this.settings.DEBUG) {

            this.renderer.renderText("DEBUG MODE", 2, this.canvas.height, this.settings.COLOR_TEXT);

            this.renderer.renderText("X: " + this.cursorX + ", Y: " + this.cursorY,
                128, this.canvas.height, this.settings.COLOR_TEXT);


            this.renderer.renderText("Selected Damage : " + this.selectedDamage,
                220, this.canvas.height, this.settings.COLOR_TEXT);
        }

    } else {
        this.printPreview();
    }
};

/**
 * Method to remove all the highlight from all the teeth
 * @returns {undefined}
 */
Engine.prototype.removeHighlight = function () {
    "use strict";
    for (var i = 0; i < this.mouth.length; i++) {
        this.mouth[i].highlight = false;
    }

};

/**
 * Method to highlight all the teeth which are marked when multiselected
 * @param {type} tooth the tooth which should be highlighted
 * @returns {undefined}
 */
Engine.prototype.highlightMultiSelection = function (tooth) {
    "use strict";
    console.log("Highlighting multiselection");
    try {

        // only highlight if we the selection is at least 1
        if (this.multiSelection.length > 0) {

            // reset the highlighting
            for (var i = 0; i < this.mouth.length; i++) {
                this.mouth[i].highlight = false;
                this.mouth[i].highlightColor = this.settings.COLOR_HIGHLIGHT;
            }

            var tooth1 = this.multiSelection[0];

            // check if these teeth are same types
            if (tooth1.type === tooth.type) {

                // get indices for both teeth
                var index1 = this.getIndexForTooth(tooth1);
                var index2 = this.getIndexForTooth(tooth);

                var begin = Math.min(index1, index2);
                var end = Math.max(index1, index2);

                // highlight the teeth between begin and end
                for (var i = begin; i <= end; i++) {

                    this.mouth[i].highlight = true;
                }

                // some damages can only have 2 items in multiselection
                if (this.selectedDamage === this.constants.TRANSPOSICION_LEFT) {

                    // if count of selection for this damage (max 2) then
                    // change the highlight color, to show that this selection
                    // is not allowed
                    if ((end - begin) > 1) {

                        for (var i = begin; i <= end; i++) {

                            this.mouth[i].highlightColor = this.settings.COLOR_HIGHLIGHT_BAD;
                        }
                    }

                }

            }

            // repaint
            this.update();
        }

    } catch (error) {
        console.log("Engine highlightMultiSelection e: " + error.message);
    }

};


/**
 * Method to reset the multiselection - deactivate multiselection
 * @returns {undefined}
 */
Engine.prototype.resetMultiSelect = function () {
    "use strict";
    this.selectedDamage = "0";
    this.multiSelect = false;
    this.multiSelection.length = 0;
    this.removeHighlight();
    this.update();
};

/**
 * Method to get the index for a tooth
 * @param {type} tooth the tooth to find the index of
 * @returns {Number} index of the tooth, -1 if not found
 */
Engine.prototype.getIndexForTooth = function (tooth) {
    "use strict";
    var index = -1;

    for (var i = 0; i < this.mouth.length; i++) {

        if (this.mouth[i].id === tooth.id) {
            index = i;
            break;
        }
    }

    return index;

};

/**
 * Method to handle multiselection. this method is called when multiselect contains
 * 2 items, start and end. This method will add or remove damages from the teeth
 * which have been selected.
 * @returns {void}
 */
Engine.prototype.handleMultiSelection = function () {
    "use strict";
    // only handle multiselect when 2 teeth have been selected
    // start and end
    if (this.multiSelection.length === 2) {


        let tooth1 = this.multiSelection[0];
        let tooth2 = this.multiSelection[1];


        // get the indices for the teeth which have been selected
        var index1 = this.getIndexForTooth(tooth1);
        var index2 = this.getIndexForTooth(tooth2);

        var valid = true;

        // make sure that we dont select the same tooth 2 times
        if (index1 === index2) {
            valid = false;
        }

        // make sure that both teeth are same type, upper or lower mouth
        if (tooth1.type !== tooth2.type) {
            valid = false;
        }

        // only toggle damages if everyhting is okey
        if (valid) {

            var start = Math.min(index1, index2);
            var end = Math.max(index1, index2);

            // check which damage should be added or removed from the selected
            // teeth
            if (this.selectedDamage === this.constants.ORTODONTICO_FIJO_END) {

                this.mouth[start].toggleDamage(this.constants.ORTODONTICO_FIJO_END,
                    this.constants);

                this.mouth[end].toggleDamage(this.constants.ORTODONTICO_FIJO_END,
                    this.constants);

                for (var i = start + 1; i <= end - 1; i++) {

                    this.mouth[i].toggleDamage(this.constants.ORTODONTICO_FIJO_CENTER,
                        this.constants);

                }

            } else if (this.selectedDamage === this.constants.PROTESIS_FIJA_LEFT) {

                this.mouth[start].toggleDamage(this.constants.PROTESIS_FIJA_RIGHT,
                    this.constants);

                this.mouth[end].toggleDamage(this.constants.PROTESIS_FIJA_LEFT,
                    this.constants);

                for (var i = start + 1; i <= end - 1; i++) {

                    this.mouth[i].toggleDamage(this.constants.PROTESIS_FIJA_CENTER,
                        this.constants);

                }

            } else if (this.selectedDamage === this.constants.TRANSPOSICION_LEFT) {

                if (end - start === 1) {

                    this.mouth[start].toggleDamage(this.constants.TRANSPOSICION_LEFT,
                        this.constants);

                    this.mouth[end].toggleDamage(this.constants.TRANSPOSICION_RIGHT,
                        this.constants);
                }

            }

        }

        // reset multiselection when it is finished
        this.multiSelection.length = 0;

        this.removeHighlight();

        this.update();
    }

};

/**
 * Method to add items to a list of selected items
 * @param {type} tooth the tooth to add to the list
 * @returns {undefined}
 */
Engine.prototype.addToMultiSelection = function (tooth) {
    "use strict";
    this.multiSelection.push(tooth);

    if (this.multiSelection.length === 2) {
        this.handleMultiSelection();
    }

};

/**
 * Method to check if a string is alphanumeric
 * @param {type} input the text to check
 * @returns {Boolean} true if aphanumeric, else false
 */
Engine.prototype.isAlphanumeric = function (input) {
    "use strict";
    var valid = false;

    var letters = /^[0-9a-zA-Z]+$/;

    if (input.match(letters)) {
        valid = true;

    }

    return valid;
};


/**
 * Method to add text to a textbox. This method only allows alphanumeric values
 * to be added to a texbox
 * @param {type} textBox for the text
 * @param {type} text to add to the textbox
 * @returns {void} 
 */
Engine.prototype.setTextToTextBox = function (textBox, text) {
    "use strict";
    if (text !== null) {
        if (text.length < 4) {

            if (this.isAlphanumeric(text)) {
                textBox.setNote(text);
            } else if (text === "") {
                textBox.setNote(text);
            }
        }
    }
};

/**
 * Method to handle when there is a mouse click on a textbox
 * the method prompts the user to input a text.
 * @param {type} textBox the textbox which has been clicked
 * @returns {void}
 */
Engine.prototype.onTextBoxClicked = function (textBox) {
    "use strict";
    var message = "Add 3 letter dental code.";

    var text = prompt(message, "");

    this.setTextToTextBox(textBox, text);

};

/**
 * Method to handle mouse right click on a space
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.mouseRightClickSpace = function (event) {
    "use strict";

    var shouldUpdate = false;

    for (var i = 0; i < this.spaces.length; i++) {
        // check collision for current space
        if (this.spaces[i].checkCollision(
            this.getXpos(event),
            this.getYpos(event))) {

            this.spaces[i].popDamage();

            shouldUpdate = true;
        }
    }

    // only update if something new has occurred
    if (shouldUpdate) {
        this.update();
    }

};

/**
 * Method to handle a right mouse click on a tooth
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.mouseRightClickTooth = function (event) {
    "use strict";

    var shouldUpdate = false;

    // loop through all teeth
    for (var i = 0; i < this.mouth.length; i++) {

        // check if there is a collision with the textBox
        if (this.mouth[i].textBox.rect.checkCollision(this.getXpos(event),
            this.getYpos(event))) {

            this.mouth[i].textBox.text = "";

        }

        // check collision for current tooth
        if (this.mouth[i].rect.checkCollision(
            this.getXpos(event),
            this.getYpos(event))) {

            this.mouth[i].popDamage();
            shouldUpdate = true;
        }


        // check if there is a collision with one of the tooth surfaces
        for (var j = 0; j < this.mouth[i].checkBoxes.length; j++) {

            if (this.mouth[i].checkBoxes[j].checkCollision(
                this.getXpos(event),
                this.getYpos(event))) {


                // handle collision with surface    
                this.mouth[i].checkBoxes[j].state = 0;

                shouldUpdate = true;
            }
        }
    }

    // only update if something new has occurred
    if (shouldUpdate) {
        this.update();
    }
};

/**
 * Method to handle mouse click event, when the spaces between the teeth 
 * are in the forground.
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.mouseClickSpace = function (event) {
    "use strict";
    var shouldUpdate = false;

    for (var i = 0; i < this.spaces.length; i++) {
        // check collision for current space
        if (this.spaces[i].checkCollision(
            this.getXpos(event),
            this.getYpos(event))) {

            this.collisionHandler.handleCollision(
                this.spaces[i],
                this.selectedDamage);

            shouldUpdate = true;
        }
    }

    // only update if something new has occurred
    if (shouldUpdate) {
        this.update();
    }

};

/**
 * Method to handle mouse click event when the teeth are in the foreground
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.mouseClickTooth = function (event) {
    "use strict";
    var shouldUpdate = false;

    // loop through all teeth
    for (var i = 0; i < this.mouth.length; i++) {

        // check if there is a collision with the textBox
        if (this.mouth[i].textBox.rect.checkCollision(this.getXpos(event),
            this.getYpos(event))) {

            if (this.currentType === 0) {
                this.onTextBoxClicked(this.mouth[i].textBox);
            }
        }

        // check collision for current tooth
        if (this.mouth[i].rect.checkCollision(
            this.getXpos(event),
            this.getYpos(event))) {

            // if we are in multi select mode
            // add this tooth to multi select list
            if (this.multiSelect) {

                this.addToMultiSelection(this.mouth[i]);

            } else {

                if (this.currentType === 0) {

                    // handle collision with tooth
                    this.collisionHandler.handleCollision(
                        this.mouth[i],
                        this.selectedDamage);

                    shouldUpdate = true;

                } else {

                    var d = new Object();

                    d.tooth = this.mouth[i].id;
                    d.damage = "";
                    d.diagnostic = this.selectedDamage;
                    d.surface = "X";
                    d.note = "";

                    this.createDiagnostico(d);

                }
            }
        }

        // check if there is a collision with one of the tooth surfaces
        for (var j = 0; j < this.mouth[i].checkBoxes.length; j++) {

            if (this.mouth[i].checkBoxes[j].checkCollision(
                this.getXpos(event),
                this.getYpos(event))) {

                console.log("Collision Checkbox : " + this.selectedDamage)

                if (this.currentType === 0) {

                    console.log("Collision Checkbox : " + this.selectedDamage)
                    // handle collision with surface    
                    this.collisionHandler.handleCollisionCheckBox(
                        this.mouth[i].checkBoxes[j],
                        this.selectedDamage);

                    shouldUpdate = true;

                } else {

                    var d = new Object();

                    d.tooth = "0";
                    d.damage = "";
                    d.diagnostic = this.selectedDamage;
                    d.surface = this.mouth[i].checkBoxes[j].id;
                    d.note = "";

                    this.createDiagnostico(d);

                }
            }
        }
    }


    // only update if something new has occurred
    if (shouldUpdate) {
        this.update();
    }

};


/**
 * Method to handle mouse click event when the teeth are in the foreground
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.mouseClickMenu = function (event) {
    "use strict";
    var shouldUpdate = false;

    // loop through all teeth
    for (var i = 0; i < this.menuItems.length; i++) {

        // check collision for current tooth
        if (this.menuItems[i].rect.checkCollision(
            this.getXpos(event),
            this.getYpos(event))) {

            if (this.menuItems[i].active) {
                for (var j = 0; j < this.menuItems.length; j++) {
                    this.menuItems[j].active = false;
                }
                this.menuItems[i].active = false;
                this.selectedDamage = 0;
            } else {
                for (var j = 0; j < this.menuItems.length; j++) {
                    this.menuItems[j].active = false;
                }
                this.menuItems[i].active = true;
                this.selectedDamage = this.menuItems[i].id;
            }

            this.setDamage(this.selectedDamage);
            console.log("Mouse click. MenuItem: ");


            shouldUpdate = true;
        }
    }

    // only update if something new has occurred
    if (shouldUpdate) {
        this.update();
    }

};


Engine.prototype.mouseClickControls = function (event) {
    "use strict";
    var shouldUpdate = false;


    if (this.adult.rect.checkCollision(
        this.getXpos(event),
        this.getYpos(event))) {

        this.adult.active = true;
        this.child.active = false;
        shouldUpdate = true;

        this.adultShowing = true;
        console.log("Setting odontograma to adult");
        this.mouth = this.odontAdult;
        this.spaces = this.odontSpacesAdult;
        this.update();
    }


    if (this.child.rect.checkCollision(
        this.getXpos(event),
        this.getYpos(event))) {

        this.adult.active = false;
        this.child.active = true;
        shouldUpdate = true;

        this.adultShowing = false;
        console.log("Setting odontograma to child");
        this.mouth = this.odontChild;
        this.spaces = this.odontSpacesChild;
        this.update();
    }


    if (this.save.rect.checkCollision(
        this.getXpos(event),
        this.getYpos(event))) {

        shouldUpdate = true;
        this.saveOdontograma();
    }

    if (this.clear.rect.checkCollision(
        this.getXpos(event),
        this.getYpos(event))) {

        shouldUpdate = true;
        this.reset();
    }


    if (shouldUpdate) {
        this.update();
    }

};

/**
 * Event handler for when the mouse is clicked
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.onMouseClick = function (event) {
    "use strict";

    console.log("Mouse click. which: " + event.which);

    if (!this.preview) {


        if (event.which === 3) {

            // check what is in foreground
            if (this.settings.HIHGLIGHT_SPACES) {

                this.mouseRightClickSpace(event);

            } else {

                this.mouseRightClickTooth(event);

            }

        } else if (event.which === 1) {
            // check what is in foreground
            if (this.settings.HIHGLIGHT_SPACES) {

                this.mouseClickSpace(event);

            } else {

                this.mouseClickTooth(event);

            }

            this.mouseClickMenu(event);
            this.mouseClickControls(event);

        }
    }

};

/**
 * Method to get the x and y coordinates of the mouse cursor
 * @param {type} event mouse move event
 * @returns {undefined}
 */
Engine.prototype.followMouse = function (event) {
    "use strict";

    this.cursorX = this.getXpos(event);
    this.cursorY = this.getYpos(event);

    this.update();
};

/**
 * Method to handle mouse move event when spaces between teeth are in foreground
 * @param {type} event mouse move envent
 * @returns {void}
 */
Engine.prototype.mouseMoveSpaces = function (event) {
    "use strict";

    for (var i = 0; i < this.spaces.length; i++) {

        var update = false;

        if (this.spaces[i].checkCollision(this.getXpos(event),
            this.getYpos(event))) {

            this.spaces[i].onTouch(true);

            update = true;

        } else {

            this.spaces[i].onTouch(false);
        }
    }

    if (update) {
        this.update();
    }
};

/**
 * Method to handle mouse move event, when teeth are in forground
 * @param {type} event mouse move event
 * @returns {void}
 */
Engine.prototype.mouseMoveTeeth = function (event) {
    "use strict";

    for (var i = 0; i < this.mouth.length; i++) {

        if (this.mouth[i].textBox.rect.checkCollision(this.getXpos(event),
            this.getYpos(event))) {

            this.mouth[i].textBox.touching = true;

        } else {

            this.mouth[i].textBox.touching = false;

        }

        if (this.mouth[i].checkCollision(this.getXpos(event),
            this.getYpos(event))) {
            this.mouth[i].onTouch(true);

            if (this.multiSelect) {

                if (this.multiSelection.length > 0) {
                    this.highlightMultiSelection(this.mouth[i]);
                }
            }

        } else {
            this.mouth[i].onTouch(false);
        }

        for (var j = 0; j < this.mouth[i].checkBoxes.length; j++) {

            if (this.mouth[i].checkBoxes[j].checkCollision(
                this.getXpos(event), this.getYpos(event))) {
                this.mouth[i].checkBoxes[j].touching = true;

            } else {
                this.mouth[i].checkBoxes[j].touching = false;
            }
        }
    }
};


Engine.prototype.mouseMoveMenuItems = function (event) {
    "use strict";

    for (var i = 0; i < this.menuItems.length; i++) {

        var update = false;

        if (this.menuItems[i].rect.checkCollision(this.getXpos(event),
            this.getYpos(event))) {

            this.menuItems[i].highlight = true;

            update = true;

        } else {

            this.menuItems[i].highlight = false;
        }
    }

    if (this.child.rect.checkCollision(this.getXpos(event),
        this.getYpos(event))) {
        this.child.highlight = true;
        update = true;
    } else {
        this.child.highlight = false;
    }


    if (this.adult.rect.checkCollision(this.getXpos(event),
        this.getYpos(event))) {
        this.adult.highlight = true;
        update = true;
    } else {
        this.adult.highlight = false;
    }

    if (this.save.rect.checkCollision(this.getXpos(event),
        this.getYpos(event))) {
        this.save.highlight = true;
        update = true;
    } else {
        this.save.highlight = false;
    }

    if (this.clear.rect.checkCollision(this.getXpos(event),
        this.getYpos(event))) {
        this.clear.highlight = true;
        update = true;
    } else {
        this.clear.highlight = false;
    }


    if (update) {
        this.update();
    }
};

/**
 * Event handler for when the mouse is moved
 * @param {type} event mouse click event
 * @returns {void}
 */
Engine.prototype.onMouseMove = function (event) {
    "use strict";

    if (!this.preview) {

        // are the spaces in forground
        if (this.settings.HIHGLIGHT_SPACES) {

            this.mouseMoveSpaces(event);

        } else {

            this.mouseMoveTeeth(event);

        }

        this.mouseMoveMenuItems(event);
    }

    // update mouse cooridnates
    this.followMouse(event);

};

/*'
 * Method to reset the odontograma
 * @returns {undefined}
 */
Engine.prototype.reset = function () {
    "use strict";
    // reset all teeth
    for (var i = 0; i < this.mouth.length; i++) {
        this.mouth[i].damages.length = 0;

        this.mouth[i].textBox.text = "";

        for (var j = 0; j < this.mouth[i].checkBoxes.length; j++) {
            this.mouth[i].checkBoxes[j].state = 0;
        }
    }

    // reset all spaces
    for (var i = 0; i < this.spaces.length; i++) {
        this.spaces[i].damages.length = 0;
    }

    // repaint
    this.update();
};

Engine.prototype.updatePatientReferences = function() {
    "use strict";
    
    // Return early if no patient ID exists
    if (!this.patientId) {
        return;
    }

    try {
        // Update mouth references with null checks and error handling
        if (Array.isArray(this.mouth)) {
            this.mouth.forEach((tooth, index) => {
                if (tooth && typeof tooth === 'object') {
                    tooth.patientId = this.patientId;
                } else {
                    console.warn(`Invalid tooth object at index ${index}`);
                }
            });
        }

        // Update spaces references with null checks and error handling
        if (Array.isArray(this.spaces)) {
            this.spaces.forEach((space, index) => {
                if (space && typeof space === 'object') {
                    space.patientId = this.patientId;
                } else {
                    console.warn(`Invalid space object at index ${index}`);
                }
            });
        }

        // Update treatment data if it exists
        if (this.treatmentData && typeof this.treatmentData === 'object') {
            this.treatmentData.patientId = this.patientId;
        }

    } catch (error) {
        console.error('Error updating patient references:', error);
        throw error; // Re-throw to allow upstream error handling
    }
};

/**
 * Method to set the patient ID for the odontogram
 * @param {string} id - The patient ID to associate with this odontogram
 * @returns {void}
 */
Engine.prototype.setPatientId = function(id) {
    "use strict";
    try {
        if (!id || (typeof id !== 'string' && typeof id !== 'number')) {
            throw new Error("Invalid patient ID format");
        }
        
        this.patientId = id.toString();
        
        // Verificar si ya existe un odontograma inicial guardado
        this.checkInitialOdontogramStatus();
        
    } catch (error) {
        console.error("Error setting patient ID:", error);
        throw error;
    }
};




/**
 * Method to save the odontograma data and associate it with the patient ID
 * @returns {void}
 */
Engine.prototype.saveOdontograma = function () {
    "use strict";
    var confirmText = prompt("Para guardar los cambios en el odontograma, escriba 'Confirmar':", "");
    
    if (confirmText === "Confirmar") {
        // Get current odontogram data
        var data = this.getOdontogramaData();
        console.log("Data to save:", data);
        
        if (data.length === 0) {
            // If no damages found, check for other data
            data = this.getData();
            console.log("Using alternative data collection:", data);
        }
        
        // Guardar datos en localStorage para la tabla
        var odontogramaData = [];
        var currentDate = getCurrentDateFormatted();
        
        // Process teeth with damages
        for (var i = 0; i < this.mouth.length; i++) {
            var tooth = this.mouth[i];
            if (tooth.damages.length > 0) {
                var damagesList = [];
                var damageType = "";
                
                var damageFecha = currentDate; // Default to current date
                
                for (var j = 0; j < tooth.damages.length; j++) {
                    damagesList.push(tooth.damages[j].name || tooth.damages[j].value);
                    // Guardamos el tipo del último daño (o el primero si solo hay uno)
                    if (tooth.damages[j].type) {
                        damageType = tooth.damages[j].type;
                    }
                    // Use the damage's fecha if it exists, otherwise keep current date
                    if (tooth.damages[j].fecha) {
                        damageFecha = tooth.damages[j].fecha;
                    }
                }
                
                odontogramaData.push({
                    diente: tooth.id,
                    tipo: damagesList.join(", "),
                    fecha: damageFecha,
                    damageType: damageType
                });
            }
            
            // Process surfaces with damages
            for (var k = 0; k < tooth.checkBoxes.length; k++) {
                var checkBox = tooth.checkBoxes[k];
                if (checkBox.state > 0) {
                    // Use checkbox fecha if available, otherwise current date
                    var checkboxFecha = (checkBox.fecha) ? checkBox.fecha : currentDate;
                    odontogramaData.push({
                        diente: tooth.id,
                        tipo: "Superficie " + checkBox.id.split('_')[1],
                        fecha: checkboxFecha
                    });
                }
            }
            
            // Process notes
            if (tooth.textBox && tooth.textBox.text && tooth.textBox.text.trim() !== "") {
                // Use textBox fecha if available, otherwise current date
                var noteFecha = (tooth.textBox.fecha) ? tooth.textBox.fecha : currentDate;
                odontogramaData.push({
                    diente: tooth.id,
                    tipo: "Nota: " + tooth.textBox.text,
                    fecha: noteFecha
                });
            }
        }
        
        // Add empty row if no data
        if (odontogramaData.length === 0) {
            odontogramaData.push({
                diente: "-",
                tipo: "No hay datos",
                fecha: currentDate
            });
        }
        
        localStorage.setItem('odontograma_' + this.tipo, JSON.stringify(odontogramaData));

        var patientId = "";
        
        // Try to get patient ID from different sources in order of priority
        if (this.patientId) {
            patientId = this.patientId;
        } else if (this.treatmentData && this.treatmentData.number) {
            patientId = this.treatmentData.number; 
        } else {
            // Extract patient ID from current URL as last resort
            var urlParts = window.location.pathname.split('/');
            var patientIdIndex = urlParts.indexOf('patients');
            if (patientIdIndex !== -1 && urlParts.length > patientIdIndex + 1) {
                patientId = urlParts[patientIdIndex + 1];
            }
        }
        
        if (patientId) {
            console.log("Guardando odontograma para el paciente ID: " + patientId);
            
            // Create and dispatch custom event with the data
            var saveEvent = new CustomEvent('saveOdontograma', {
                detail: {
                    tipo: this.tipo || 'inicial',
                    data: data,
                    patientId: patientId,
                    observations: this.observations || "",
                    specifications: this.specifications || ""
                }
            });
            
            document.dispatchEvent(saveEvent);
            console.log("Evento saveOdontograma disparado con éxito");
            alert("Odontograma guardado correctamente.");
        } else {
            console.warn("No hay ID de paciente para guardar el odontograma");
            alert("No se puede guardar el odontograma porque no hay un ID de paciente asociado.");
        }
    } else if (confirmText !== null) {
        alert("Texto de confirmación incorrecto. El odontograma no ha sido guardado.");
    }
};

/**
 * Method to get the current odontograma data
 * @returns {Array} Array of damage objects representing the current state
 */
Engine.prototype.getOdontogramaData = function() {
    "use strict";
    var data = [];
    
    // Process current mouth state (adult or child)
    for (var i = 0; i < this.mouth.length; i++) {
        var tooth = this.mouth[i];
        
        // Add damages for this tooth
        for (var j = 0; j < tooth.damages.length; j++) {
            var damage = tooth.damages[j];
            if (damage && damage.value !== undefined) {
                data.push({
                    tooth: tooth.id,
                    damage: damage.value.toString(),
                    surface: damage.surface || "0",
                    note: damage.note || ""
                });
            }
        }
        
        // Add surface damages (checkboxes)
        for (var k = 0; k < tooth.checkBoxes.length; k++) {
            var checkBox = tooth.checkBoxes[k];
            if (checkBox.state > 0) {
                var parts = checkBox.id.split('_');
                if (parts.length === 2) {
                    data.push({
                        tooth: tooth.id,
                        damage: checkBox.state.toString(),
                        surface: parts[1],
                        note: ""
                    });
                }
            }
        }
        
        // Add tooth notes if any
        if (tooth.textBox && tooth.textBox.text && tooth.textBox.text.trim() !== "") {
            data.push({
                tooth: tooth.id,
                damage: "",
                surface: "0", 
                note: tooth.textBox.text
            });
        }
    }
    
    // Process spaces
    for (var i = 0; i < this.spaces.length; i++) {
        var space = this.spaces[i];
        
        for (var j = 0; j < space.damages.length; j++) {
            var damage = space.damages[j];
            if (damage && damage.value !== undefined) {
                data.push({
                    space: space.id,
                    damage: damage.value.toString()
                });
            }
        }
    }
    
    console.log("Generated odontograma data:", data);
    return data;
};
/**
 * Method to save the initial odontograma with a screenshot
 * This method captures the current state of the canvas as an image
 * and dispatches an event with the image data and odontograma data
 * @returns {void}
 */
Engine.prototype.checkInitialOdontogramStatus = function() {
    "use strict";
    
    // Hacer llamada al servidor para verificar si existe odontograma inicial
    fetch(`/api/patients/${this.patientId}/has-initial-odontogram`)
        .then(response => response.json())
        .then(data => {
            this.hasSavedInitialOdontogram = data.hasSaved;
        })
        .catch(error => {
            console.error("Error checking initial odontogram:", error);
        });
};

Engine.prototype.saveOdontogramaInicial = function () {
    "use strict";
    try {
        // Check if initial odontogram was already saved
        if (this.hasSavedInitialOdontogram) {
            console.log("Initial odontogram was already saved");
            return true;
        }

        var confirmText = confirm("¿Está seguro que desea guardar el odontograma inicial? Una vez guardado, no podrá modificarlo.");
        
        if (confirmText !== true) return false;

        // Validate canvas
        if (!this.canvas || !this.canvas.getContext) {
            throw new Error("Canvas element is not valid");
        }

        // Capture image
        var imageData = this.canvas.toDataURL('image/png');
        
        // Validate image data
        if (!imageData || imageData.length < 1000) {
            throw new Error("Invalid image data captured");
        }

        // Get odontogram data
        var odontogramaData = this.getData();
        
        if (!odontogramaData || !Array.isArray(odontogramaData)) {
            throw new Error("Invalid odontogram data");
        }

        // Validate patient ID
        if (!this.patientId || typeof this.patientId !== 'string') {
            throw new Error("Invalid patient ID");
        }

        // Dispatch event with timestamp
        var event = new CustomEvent('saveOdontogramaInicial', {
            detail: {
                tipo: 'inicial',
                data: odontogramaData,
                imageData: imageData,
                patientId: this.patientId,
                timestamp: convertDDMMYYYYToISO(getCurrentDateFormatted())
            }
        });
        
        document.dispatchEvent(event);
        
        // Mark as saved
        this.hasSavedInitialOdontogram = true;
        console.log("Initial odontogram saved successfully");
        return true;

    } catch (error) {
        console.error("Error saving odontogram:", error);
        alert("Error al guardar el odontograma inicial: " + error.message);
        return false;
    }
};

/**
 * Method to get all the data from the engine.
 * Struct for a damage is the following
 * 
 * struct damage{
 *      tooth: int;
 *      damage: int;
 *      surface: String;
 *      note: String;
 * }
 * @returns {array} list of all the damages which exists in the odontograma
 */
Engine.prototype.getData = function () {
    "use strict";
    try {
        var list = [];
        
        // Validate mouth and spaces arrays
        if (!Array.isArray(this.odontAdult) || !Array.isArray(this.odontSpacesAdult) ||
            !Array.isArray(this.odontChild) || !Array.isArray(this.odontSpacesChild)) {
            throw new Error("Invalid odontogram data structure");
        }

        // Helper function to process spaces data
        const processSpaces = (spaces) => {
            spaces.forEach(space => {
                space.damages.forEach(damage => {
                    list.push({
                        tooth: space.id,
                        damage: damage.id,
                        diagnostic: "",
                        surface: "0",
                        note: ""
                    });
                });
            });
        };

        // Helper function to process teeth data
        const processTeeth = (teeth) => {
            teeth.forEach(tooth => {
                // Process text box notes
                if (tooth.textBox.text !== "") {
                    list.push({
                        tooth: tooth.id,
                        damage: "",
                        diagnostic: "",
                        surface: "0",
                        note: tooth.textBox.text,
                        fecha: tooth.textBox.fecha || getCurrentDateFormatted()
                    });
                }

                // Process tooth damages
                tooth.damages.forEach(damage => {
                    list.push({
                        tooth: tooth.id,
                        damage: damage.id.toString(),
                        diagnostic: "",
                        surface: "0",
                        note: "",
                        fecha: damage.fecha || getCurrentDateFormatted()
                    });
                });

                // Process surface damages (checkboxes)
                tooth.checkBoxes.forEach(checkbox => {
                    if (checkbox.state !== 0) {
                        list.push({
                            tooth: tooth.id,
                            damage: checkbox.state,
                            diagnostic: "",
                            surface: checkbox.id,
                            note: tooth.textBox.text,
                            fecha: checkbox.fecha || getCurrentDateFormatted()
                        });
                    }
                });
            });
        };

        // Process adult odontogram
        processSpaces(this.odontSpacesAdult);
        processTeeth(this.odontAdult);

        // Process child odontogram
        processSpaces(this.odontSpacesChild);
        processTeeth(this.odontChild);

        return list;

    } catch (error) {
        console.error("Error getting odontogram data:", error);
        return [];
    }
};

Engine.prototype.processOdontogramData = function(list, teeth, spaces) {
    "use strict";
    // Process spaces
    for (var i = 0; i < spaces.length; i++) {
        var t1 = spaces[i];
        if (!t1 || !t1.damages) continue;

        for (var j = 0; j < t1.damages.length; j++) {
            if (!t1.damages[j]) continue;

            var d = {
                tooth: t1.id,
                damage: t1.damages[j].id,
                diagnostic: "",
                surface: "0",
                note: ""
            };
            list.push(d);
        }
    }

    // Process teeth
    for (var i = 0; i < teeth.length; i++) {
        var t1 = teeth[i];
        if (!t1) continue;

        // Process text box
        if (t1.textBox && t1.textBox.text) {
            var d = {
                tooth: t1.id,
                damage: "",
                diagnostic: "",
                surface: "0",
                note: t1.textBox.text
            };
            list.push(d);
        }

        // Process damages
        for (var j = 0; j < t1.damages.length; j++) {
            if (!t1.damages[j]) continue;

            var d = {
                tooth: t1.id,
                damage: "" + t1.damages[j].id,
                diagnostic: "",
                surface: "0",
                note: ""
            };
            list.push(d);
        }

        // Process checkboxes
        for (var j = 0; j < t1.checkBoxes.length; j++) {
            if (!t1.checkBoxes[j] || t1.checkBoxes[j].state === 0) continue;

            var d = {
                tooth: t1.id,
                damage: t1.checkBoxes[j].state,
                diagnostic: "",
                surface: t1.checkBoxes[j].id,
                note: t1.textBox.text
            };
            list.push(d);
        }
    }
};


/**
 * Method to save the odontograma as an image file
 * @returns {void}
 */
Engine.prototype.save = function () {
    "use strict";

    // save image as png
    var link = document.createElement('a');

    // create a unique name
    var name = Date.now() + ".png";

    link.download = name;

    // Create an image stream of the canvas
    link.href = this.canvas.toDataURL("image/png")
        .replace("image/png", "image/octet-stream");


    // download the image
    link.click();

};

/*
 * Helper function to map keyboard keys into usable values Just for debugging
 * @param {type} event keyDown event
 * @returns {Number} 
 */
Engine.prototype.keyMapper = function (event) {
    "use strict";
    var value = 0;

    if (event.key === "q") {
        value = 10;
    } else if (event.key === "w") {
        value = 11;
    } else if (event.key === "e") {
        value = 12;
    } else if (event.key === "r") {
        value = 13;
    } else if (event.key === "t") {
        value = 14;
    } else if (event.key === "y") {
        value = 15;
    } else if (event.key === "u") {
        value = 16;
    } else if (event.key === "i") {
        value = 17;
    } else if (event.key === "o") {
        value = 18;
    } else if (event.key === "p") {
        value = 19;
    } else if (event.key === "a") {
        value = 20;
    } else if (event.key === "s") {
        value = 21;
    } else if (event.key === "d") {
        value = 22;
    } else if (event.key === "f") {
        value = 23;
    } else if (event.key === "g") {
        value = 24;
    } else if (event.key === "h") {
        value = 25;
    } else if (event.key === "j") {
        value = 27;
    } else if (event.key === "k") {
        value = 28;
    } else if (event.key === "l") {
        value = 29;
    } else if (event.key === "x") {
        value = 30;
    } else if (event.key === "c") {
        value = 31;
    } else if (event.key === "b") {
        value = 32;
    } else if (event.key === "n") {
        value = 34;
    } else if (event.key === "m") {
        value = "DG990";
    }

    return value;
};

/**
 * Event handler for when a keyboard button is clicked.
 * @param {type} event button event
 * @returns {void}
 */
Engine.prototype.onButtonClick = function (event) {
    "use strict";
    console.log("key " + event.key);

    if (event.key === "p") {
        this.print();
    }


    if (event.key === "v") {

        var data = this.getData();

        console.log("Data length: " + data.length);

        for (var i = 0; i < data.length; i++) {

            console.log("Data[" + i + "]: " + data[i].tooth + ", "
                + data[i].damage + ", " + data[i].surface + ", "
                + data[i].note);

        }

    } else if (event.key === "-") {

        this.togglePrintPreview();

    } else {

        if (event.key === ".") {

            this.currentType = 1;

            this.selectedDamage = "kb90";

        } else {

            this.currentType = 0;

            var damage;

            let key = Number(event.key);

            if (isNaN(key)) {
                damage = this.keyMapper(event);
            } else {
                damage = key;
            }

            this.setDamage(damage);

            if (event.key === "z") {
                this.selectedDamage = 0;
                this.reset();
            }

            // key combination Ctrl + Q to activate debug mode
            if ((event.which === 81 || event.keyCode === 81) && event.ctrlKey) {
                this.settings.DEBUG = !this.settings.DEBUG;

                this.update();
            }

            // key combination Ctrl + W to save the canvas as an image file
            if ((event.which === 81 || event.keyCode === 81) && event.shiftKey) {
                this.settings.DEBUG = !this.settings.DEBUG;

                this.save();
            }

            if (event.key === "ArrowLeft") {

                this.adultShowing = true;
                console.log("Setting odontograma to adulto");
                this.mouth = this.odontAdult;
                this.spaces = this.odontSpacesAdult;
                this.update();

            }

            if (event.key === "ArrowRight") {

                this.adultShowing = false;
                console.log("Setting odontograma to Niño");
                this.mouth = this.odontChild;
                this.spaces = this.odontSpacesChild;
                this.update();
            }
        }
    }
};

/**
 * Method to set the damage which the engine should toggle on or off
 * @param {type} damage id of the damge
 * @returns {void}
 */
Engine.prototype.setDamage = function (damage) {
    "use strict";
    this.multiSelect = false;
    this.multiSelection.length = 0;

    console.log("Engine setting damage: " + damage);

    this.selectedDamage = parseInt(damage, 10) || 0;

    if (this.selectedDamage === this.constants.TRANSPOSICION_LEFT) {
        this.multiSelect = true;
        this.multiSelection.length = 0;

    }

    if (this.selectedDamage === this.constants.ORTODONTICO_FIJO_END) {
        this.multiSelect = true;
        this.multiSelection.length = 0;
    }

    if (this.selectedDamage === this.constants.PROTESIS_FIJA_LEFT) {
        this.multiSelect = true;
        this.multiSelection.length = 0;
    }

    if (this.selectedDamage === this.constants.SUPER_NUMERARIO) {

        this.settings.HIHGLIGHT_SPACES = true;
        this.update();
    }

    if (this.selectedDamage === this.constants.DIASTEMA) {

        this.settings.HIHGLIGHT_SPACES = true;
        this.update();
    }

    if (this.selectedDamage !== this.constants.DIASTEMA &&
        this.selectedDamage !== this.constants.SUPER_NUMERARIO) {

        this.settings.HIHGLIGHT_SPACES = false;
        this.update();
    }

    this.selectedDamage = damage;
};

/**
 * Method to change odontograma view
 * @param {type} which type of odontograma "0" = adult
 * @returns {void}
 */
Engine.prototype.changeView = function (which) {
    "use strict";
    if (which === "1") {

        this.adultShowing = false;
        this.mouth = this.odontChild;
        this.spaces = this.odontSpacesChild;
        this.update();


    } else {

        this.adultShowing = true;
        this.mouth = this.odontAdult;
        this.spaces = this.odontSpacesAdult;
        this.update();

    }

};

/**
 * Method to start the engine. Methods gets called
 * when all assets have been loaded.
 * @returns {void}
 */
Engine.prototype.start = function () {
    "use strict";
    var self = this;

    // Renderizar inmediatamente para mostrar los botones del menú
    this.update();

    // show splash screen for 3 seconds 
    // then continue
    setTimeout(function () {
        self.update();
    }, 1500);

};

/**
 * Method to get a tooth by its id
 * @param {type} id of the tooth
 * @returns {Tooth} tooth with the specified id. Undefined if the tooth does
 * not exist
 */
Engine.prototype.getToothById = function (id) {
    "use strict";
    var tooth;

    for (var i = 0; i < this.mouth.length; i++) {

        if (this.mouth[i].id === id) {

            tooth = this.mouth[i];
            // ---> DEBUG LOG <---
            console.log(`[Engine.getToothById] Found tooth for ID: ${id}. Instance:`, tooth);
            console.log(`[Engine.getToothById] Prototype of found tooth:`, Object.getPrototypeOf(tooth));
            console.log(`[Engine.getToothById] tooth.refresh exists?`, typeof tooth?.refresh === 'function');
            // ------------------
            break;

        }
    }

    return tooth;

};

/**
 * Method to get a space, between 2 teeths, by id
 * @param {type} id of the space
 * @returns {Tooth} the space for the id
 */
Engine.prototype.getSpaceById = function (id) {
    "use strict";
    var space;

    for (var i = 0; i < this.spaces.length; i++) {

        if (this.spaces[i].id === id) {

            space = this.spaces[i];
            break;

        }
    }

    return space;

};

/**
 * Method to load damages to odontograma from external source
 * @param {type} tooth id of the tooth which has the damage
 * @param {type} damage id of the damage to add
 * @param {type} surface id of the surface to add damage, empty if no surface
 * @param {type} note text to add to textbox for tooth, empty if no note
 * @returns {undefined}
 */
Engine.prototype.load = function (tooth, damage, surface, note) {
    "use strict";
    // check if we should add damage to a tooth
    if (surface === "0") {

        // if id is less than 1000 then we have to find a tooth
        if (tooth < 1000) {

            var t = this.getToothById(tooth);

            this.collisionHandler.handleCollision(t, damage);

            this.setTextToTextBox(t.textBox, note);

        } else {

            // if the id is greater than 1000
            // then we have to find a space
            this.collisionHandler.handleCollision(this.getSpaceById(tooth), damage);
        }


    } else {

        // the damage should be added to a surface of a tooth
        var surfaceId = tooth + "_" + surface;

        var t = this.getToothById(tooth);
        var surface = t.getSurfaceById(surfaceId);

        this.collisionHandler.handleCollisionCheckBox(surface, damage);

        this.setTextToTextBox(t.textBox, note);

    }

};

/**
 * Method to pass a comma seperated string for loading data
 * fomat of string: toothId,damageId,surface,note,...toothId,damageId,surface,note
 * @param {type} dataArray commea seperated string
 * @returns {void}
 */
Engine.prototype.setDataSource = function (dataArray) {
    "use strict";
    var res = dataArray.split(",");

    var i = 0;
    while (i < res.length) {

        // loop through all and add damage
        this.load(Number(res[i]), Number(res[i + 1]), res[i + 2], res[i + 3]);

        i = i + 4;
    }

};

Engine.prototype.createDiagnostico = function (diagnostico) {

    console.log("Diagnostico: " + JSON.stringify(diagnostico));
};

/**
 * Method to toggle print preview on / off
 * @returns {undefined}
 */
Engine.prototype.togglePrintPreview = function () {

    this.preview = !this.preview;

    if (!this.preview) {
        this.hidePrintPreview();
    } else {
        this.showPrintPreview();
    }

};

/**
 * Method to to display a print preview of the odontogram
 * @returns {void}
 */
Engine.prototype.showPrintPreview = function () {

    // reset the size of the canvas
    this.renderer.setCanvasSize(this.renderer.width, 1420);

    console.log("Print preview");

    // reset positions

    for (var i = 0; i < this.odontAdult.length; i++) {

        if (this.odontAdult[i].type === 1) {
            this.odontAdult[i].moveUpDown(this.printPreviewPositionChange * 2 + 120);
            this.odontAdult[i].textBox.rect.y += 20;

        } else {
            this.odontAdult[i].moveUpDown(120);
            this.odontAdult[i].textBox.rect.y -= 20;
        }

    }

    for (var i = 0; i < this.odontSpacesAdult.length; i++) {

        if (this.odontSpacesAdult[i].type === 1) {
            this.odontSpacesAdult[i].moveUpDown(this.printPreviewPositionChange * 2 + 120);
        } else {
            this.odontSpacesAdult[i].moveUpDown(120);
        }

    }

    for (var i = 0; i < this.odontChild.length; i++) {

        this.odontChild[i].moveUpDown(this.printPreviewPositionChange + 120);

        if (this.odontChild[i].type === 0) {
            this.odontChild[i].textBox.rect.y -= this.printPreviewPositionChange;
        } else {
            this.odontChild[i].textBox.rect.y += this.printPreviewPositionChange;
        }

    }

    for (var i = 0; i < this.odontSpacesChild.length; i++) {

        this.odontSpacesChild[i].moveUpDown(this.printPreviewPositionChange + 120);

    }

    // realligne all teeth and damages
    for (var i = 0; i < this.odontAdult.length; i++) {
        this.odontAdult[i].refresh(this.constants);
    }

    for (var i = 0; i < this.odontChild.length; i++) {
        this.odontChild[i].refresh(this.constants);
    }


    this.update();

};

/**
 * Method to hide print preview
 * @returns {void}
 */
Engine.prototype.hidePrintPreview = function () {

    // update size of the canvas
    this.renderer.setCanvasSize(this.renderer.width, this.renderer.height);

    console.log("Print preview");

    // update the positions of all the data in the odontoram

    for (var i = 0; i < this.odontAdult.length; i++) {

        if (this.odontAdult[i].type === 1) {
            this.odontAdult[i].moveUpDown(-this.printPreviewPositionChange * 2 - 120);
            this.odontAdult[i].textBox.rect.y -= 20;
        } else {
            this.odontAdult[i].moveUpDown(-120);
            this.odontAdult[i].textBox.rect.y += 20;
        }

    }

    for (var i = 0; i < this.odontSpacesAdult.length; i++) {

        if (this.odontSpacesAdult[i].type === 1) {
            this.odontSpacesAdult[i].moveUpDown(-this.printPreviewPositionChange * 2 - 120);
        } else {
            this.odontSpacesAdult[i].moveUpDown(-120);
        }
    }

    for (var i = 0; i < this.odontChild.length; i++) {

        this.odontChild[i].moveUpDown(-this.printPreviewPositionChange - 120);

        if (this.odontChild[i].type === 0) {
            this.odontChild[i].textBox.rect.y += this.printPreviewPositionChange;
        } else {
            this.odontChild[i].textBox.rect.y -= this.printPreviewPositionChange;
        }
    }

    for (var i = 0; i < this.odontSpacesChild.length; i++) {

        this.odontSpacesChild[i].moveUpDown(-this.printPreviewPositionChange - 120);

    }

    for (var i = 0; i < this.odontAdult.length; i++) {
        this.odontAdult[i].refresh();
    }

    for (var i = 0; i < this.odontChild.length; i++) {
        this.odontChild[i].refresh();
    }

    this.update();

};


/**
 * Method to load odontograma data from saved state
 * @param {Array} data - Array of damage objects to load
 * @returns {void}
 */
Engine.prototype.loadOdontogramaData = function(data) {
    "use strict";
    if (!Array.isArray(data)) {
        console.error("[loadOdontogramaData] Invalid data format: Expected array, got:", data);
        return;
    }

    console.log("[loadOdontogramaData] Attempting to load data:", JSON.stringify(data));

    let itemsProcessed = 0;
    let errors = 0;

    data.forEach((item, index) => {
        try {
            // Procesar daños de dientes
            if (item.tooth) {
                const toothId = parseInt(item.tooth, 10);
                if (isNaN(toothId)) {
                    console.warn(`[loadOdontogramaData] Invalid tooth ID in item ${index}:`, item.tooth);
                    errors++;
                    return;
                }

                const targetTooth = this.getToothById(toothId);
                if (!targetTooth) {
                    console.warn(`[loadOdontogramaData] Tooth not found for ID ${toothId} in item ${index}`);
                    errors++;
                    return;
                }

                const damageType = item.damage;
                // Extraer el código de superficie del formato "toothId_surface" si existe
                const surface = item.surface ? (item.surface.includes('_') ? item.surface.split('_')[1] : item.surface) : "0";
                const note = item.note || "";
                // Asegurarse de preservar la fecha original
                const fecha = item.fecha || item.date;

                // Prioridad: Nota si existe y no hay daño específico
                if (note && !damageType) {
                    console.log(`[loadOdontogramaData] Applying note to tooth ${toothId}: "${note}"`);
                    // Usar el método setNote con preserveFecha=true para mantener la fecha original
                    targetTooth.textBox.setNote(note, true);
                    // Preservar la fecha original de la nota o usar la fecha actual
                    if (fecha) {
                        targetTooth.textBox.fecha = fecha;
                    } else {
                        targetTooth.textBox.fecha = getCurrentDateFormatted();
                    }
                    itemsProcessed++;
                } 
                // Daño de superficie (incluyendo Empaste)
                else if (surface && surface !== "0") {
                    console.log(`[loadOdontogramaData] Applying surface damage to tooth ${toothId}, surface ${surface}, type ${damageType}`);
                    this.processSurfaceDamage(targetTooth, toothId, surface, damageType, fecha);
                    itemsProcessed++;
                } 
                // Daño general del diente (solo si no es Empaste)
                else if (damageType && damageType !== "11") {
                    console.log(`[loadOdontogramaData v4] Applying general tooth damage to tooth ${toothId}, type ${damageType}`);
                    
                    if (!targetTooth.damages) {
                        targetTooth.damages = [];
                    }
                    if (!Array.isArray(targetTooth.damages)) {
                        console.warn(`[loadOdontogramaData v4] targetTooth.damages for tooth ${toothId} was not an array. Reinitializing.`);
                        targetTooth.damages = [];
                    }

                    const damageCode = parseInt(damageType, 10);
                    if (!isNaN(damageCode)) {
                        const alreadyExists = targetTooth.damages.some(d => d && d.value === damageCode);
                        if (!alreadyExists) {
                            const newDamage = targetTooth.createDamage(damageCode);
                            if (newDamage) {
                                newDamage.surface = surface || "0";
                                newDamage.note = note || "";
                                // Usar addDamage en lugar de push directo para aprovechar la verificación de duplicados
                                // El método createDamage ya fue llamado, pero addDamage tiene la lógica de verificación
                                // Recreamos el daño usando addDamage, preservando la fecha original
                                targetTooth.addDamage(damageCode, surface || "0", note || "", fecha);
                                console.log(`[loadOdontogramaData v4] Damage ${damageCode} created via targetTooth.createDamage for tooth ${toothId}.`);
                            } else {
                                console.warn(`[loadOdontogramaData v4] targetTooth.createDamage returned undefined for damageCode ${damageCode} on tooth ${toothId}`);
                            }
                        } else {
                            console.log(`[loadOdontogramaData v4] Damage ${damageCode} already exists on tooth ${toothId}. Skipping.`);
                        }
                    } else {
                        console.warn(`[loadOdontogramaData v4] Non-numeric damage type '${damageType}' encountered for tooth ${toothId}. Treating as info/note if possible, otherwise skipping.`);
                        const newDamage = targetTooth.createDamage(damageType);
                        if (newDamage) {
                            // Usar addDamage en lugar de push directo para aprovechar la verificación de duplicados
                            // El método createDamage ya fue llamado, pero addDamage tiene la lógica de verificación
                            // Recreamos el daño usando addDamage, preservando la fecha original
                            targetTooth.addDamage(damageType, surface || "0", note || "", fecha);
                            console.log(`[loadOdontogramaData v4] Non-numeric Damage '${damageType}' created via targetTooth.createDamage for tooth ${toothId}.`);
                        } else {
                            console.warn(`[loadOdontogramaData v4] targetTooth.createDamage returned undefined for non-numeric damage '${damageType}' on tooth ${toothId}`);
                        }
                    }
                    itemsProcessed++;
                }
                else {
                    console.log(`[loadOdontogramaData] Skipping item ${index} for tooth ${toothId} with no damage/surface/note.`);
                }
            } 
            // Procesar daños de espacios (menos común, mantener simple por ahora)
            else if (item.space) {
                const spaceId = parseInt(item.space, 10);
                 if (isNaN(spaceId)) {
                    console.warn(`[loadOdontogramaData] Invalid space ID in item ${index}:`, item.space);
                    errors++;
                    return; // Saltar este item
                }
                const targetSpace = this.getSpaceById(spaceId);
                 if (!targetSpace) {
                    console.warn(`[loadOdontogramaData] Space not found for ID ${spaceId} in item ${index}`);
                    errors++;
                    return; // Saltar este item
                }
                
                const damageType = item.damage;
                if (damageType) {
                     console.log(`[loadOdontogramaData] Applying space damage to space ${spaceId}, type ${damageType}`);
                     // Asumiendo que processSpace maneja la lógica interna
                     this.processSpace(item); // <- processSpace debería usar createDamage si aplica a espacios
                    itemsProcessed++;
                }
            }
             // Ignorar items que no tengan ni tooth ni space
             else {
                 console.warn(`[loadOdontogramaData] Skipping item ${index} with invalid structure:`, item);
                 errors++;
             }

        } catch (error) {
            console.error(`[loadOdontogramaData] Error processing item ${index}:`, item, error);
            errors++;
        }
    });

    this.update(); // Forzar actualización del canvas al final

    console.log(`[loadOdontogramaData] Finished loading: ${itemsProcessed} items processed, ${errors} errors.`);
};

Engine.prototype.processTooth = function(damageItem) {
    const toothId = parseInt(damageItem.tooth);
    const damageType = damageItem.damage;
    const surface = damageItem.surface || "0";
    const note = damageItem.note || "";
    
    console.log("[Deprecated] Processing damage via processTooth:", toothId, damageType, surface, note); // Marcar como deprecated
    
    // Find target tooth
    const targetTooth = this.mouth.find(tooth => tooth.id === toothId);
    
    if (!targetTooth) {
        console.warn("[Deprecated] Tooth not found with ID:", toothId);
        return;
    }
    
    // Update tooth note if exists
    if (note) {
        targetTooth.textBox.text = note;
    }
    
    // Handle surface damage
    if (surface && surface !== "0") {
        this.processSurfaceDamage(targetTooth, toothId, surface, damageType); // Esta podría seguir siendo útil
    } 
    // Handle tooth damage - USAR MÉTODO CORRECTO AHORA
    else if (damageType && damageType !== "") {
        // this.processToothDamage(targetTooth, toothId, damageType, surface, note); // <- Llamada antigua
        const damageCode = parseInt(damageType);
        if (!isNaN(damageCode)) {
            // Usar addDamage para aprovechar la verificación de duplicados
            const addedDamage = targetTooth.addDamage(damageCode, surface || "0", note || "", damageItem.fecha);
            if (addedDamage) {
                console.log(`[Deprecated processTooth] Damage ${damageCode} created via targetTooth.addDamage.`);
                // targetTooth.refresh(this.constants); // No refrescar aquí
            }
        } else {
             console.warn("[Deprecated processTooth] Non-numeric damage type:", damageType);
             // Usar addDamage para aprovechar la verificación de duplicados
             const addedDamage = targetTooth.addDamage(damageType, surface || "0", note || "", damageItem.fecha);
             if (addedDamage) {
                 console.log(`[Deprecated processTooth] Non-numeric Damage ${damageType} created via targetTooth.addDamage.`);
                 // targetTooth.refresh(this.constants); // No refrescar aquí
             }
        }
        // this.update(); // No actualizar aquí, dejar que el llamador lo haga
    }
};

Engine.prototype.processSurfaceDamage = function(targetTooth, toothId, surface, damageType, fecha) {
    const surfaceId = toothId + "_" + surface;
    const targetSurface = targetTooth.checkBoxes.find(box => box.id === surfaceId);
    
    if (targetSurface) {
        // Si el daño es 11 (Empaste), asegurarnos de que se aplique como daño de superficie
        if (damageType === "11" || damageType === 11) {
            targetSurface.state = 11; // Código específico para Empaste
            console.log("Applied Empaste (11) to surface", surfaceId);
        } else {
            targetSurface.state = parseInt(damageType) || 1;
            console.log("Updated surface", surfaceId, "to state", targetSurface.state);
        }
        
        // Preservar la fecha original del daño o usar la fecha actual
        if (fecha) {
            targetSurface.fecha = fecha;
        } else {
            targetSurface.fecha = getCurrentDateFormatted();
        }
    } else {
        console.warn("Surface not found:", surface, "for tooth:", toothId);
    }
};

Engine.prototype.processToothDamage = function(targetTooth, toothId, damageType, surface, note, fecha) {
    // Esta función ahora está obsoleta y su lógica principal se movió a loadOdontogramaData
    // Mantenemos la estructura por si es llamada desde otro lugar, pero redirigimos
    console.warn("[Deprecated processToothDamage] Called. Redirecting logic.");

    const damageCode = parseInt(damageType);
    
    if (!isNaN(damageCode)) {
        console.log("[Deprecated processToothDamage] Applying damage code", damageCode, "to tooth", toothId);
        
        targetTooth.damages = targetTooth.damages || []; 
        
        const existingDamage = targetTooth.damages.find(d => d && d.value === damageCode);
        if (existingDamage) {
            console.log("[Deprecated processToothDamage] Damage already exists.");
            return;
        }
        
        // *** Usar addDamage para aprovechar la verificación de duplicados ***
        const addedDamage = targetTooth.addDamage(damageCode, surface || "0", note || "", fecha);
        if (addedDamage) {
             console.log(`[Deprecated processToothDamage] Damage ${damageCode} created via addDamage.`);
            // targetTooth.refresh(this.constants); // No refrescar aquí
        } else {
             console.warn(`[Deprecated processToothDamage] targetTooth.addDamage failed for ${damageCode}`);
        }
        // **********************************
        
        // Forzar una actualización del canvas podría ser responsabilidad del llamador
        // this.update(); 
    } else if (damageType && damageType !== "") {
        console.warn("[Deprecated processToothDamage] Non-numeric damage code:", damageType);
         // *** Usar addDamage para aprovechar la verificación de duplicados ***
         const addedDamage = targetTooth.addDamage(damageType, surface || "0", note || "", fecha);
         if (addedDamage) {
             console.log(`[Deprecated processToothDamage] Non-numeric Damage ${damageType} created via addDamage.`);
             // targetTooth.refresh(this.constants); // No refrescar aquí
         } else {
             console.warn(`[Deprecated processToothDamage] targetTooth.addDamage failed for ${damageType}`);
         }
         // **********************************
        // this.update();
    }
};

Engine.prototype.processSpace = function(damageItem) {
    "use strict";
    // Validate input
    if (!damageItem || typeof damageItem !== 'object') {
        console.error("Invalid damageItem parameter");
        return;
    }

    // Parse space ID with validation
    const spaceId = parseInt(damageItem.space, 10);
    if (isNaN(spaceId)) {
        console.error("Invalid space ID:", damageItem.space);
        return;
    }

    // Parse damage type
    const damageType = damageItem.damage;
    
    // Find target space
    const targetSpace = this.spaces.find(space => space.id === spaceId);
    
    if (!targetSpace) {
        console.warn("Space not found with ID:", spaceId);
        return;
    }
    
    // *** USAR createDamage DEL ESPACIO (si existe y es similar a Tooth) ***
    // Asumiendo que Space tiene un método createDamage similar a Tooth
    const damageCode = parseInt(damageType);
    if (!isNaN(damageCode)) {
        // Verificar si existe método y llamarlo
        if (typeof targetSpace.createDamage === 'function') {
             const newDamage = targetSpace.createDamage(damageCode);
             if (newDamage) {
                 // Asignar surface/note si aplica a espacios
                 // newDamage.surface = ... 
                 // newDamage.note = ...
                 if (!targetSpace.damages.includes(newDamage)) {
                     targetSpace.damages.push(newDamage);
                 }
                 console.log("Added damage", damageCode, "to space", spaceId, "via createDamage");
             } else {
                 console.warn(`[processSpace] targetSpace.createDamage failed for ${damageCode}`);
             }
        } else {
             // Fallback a la lógica anterior si no existe createDamage en Space
             console.warn(`[processSpace] targetSpace.createDamage not found. Using old logic.`);
             const damage = new Damage(); // <-- OJO: Esto crea un daño sin coordenadas
             damage.id = damageCode || 0;
             damage.value = damage.id;
             
             if (damage.id !== 0 || (damageType && damageType !== "")) {
                 const existingDamage = targetSpace.damages.find(d => d.id === damage.id);
                 if (!existingDamage) {
                     targetSpace.damages.push(damage);
                     console.log("Added damage", damage.id, "to space", spaceId, "(old logic)");
                 } else {
                     console.warn("Damage already exists for space (old logic):", spaceId);
                 }
             }
        }
    } else if (damageType && damageType !== "") {
         // Manejar códigos no numéricos si es necesario, similar al numérico
         console.warn(`[processSpace] Handling non-numeric damage type '${damageType}'`);
         if (typeof targetSpace.createDamage === 'function') {
             const newDamage = targetSpace.createDamage(damageType);
              if (newDamage) {
                  if (!targetSpace.damages.includes(newDamage)) {
                      targetSpace.damages.push(newDamage);
                  }
                  console.log("Added non-numeric damage", damageType, "to space", spaceId, "via createDamage");
              } else {
                   console.warn(`[processSpace] targetSpace.createDamage failed for '${damageType}'`);
              }
         } else {
              console.warn(`[processSpace] targetSpace.createDamage not found. Using old logic for non-numeric.`);
              // Lógica fallback...
         }
    }
    // ********************************************************************
};

Engine.prototype.loadPatientData = function (office, patient, number,
    treatmentNumber, treatmentDate,
    dentist, observations, specs) {

    this.treatmentData.office = office;
    this.treatmentData.patient = patient;
    this.treatmentData.number = number;
    this.treatmentData.treatmentNumber = treatmentNumber;
    this.treatmentData.treatmentDate = treatmentDate;
    this.treatmentData.dentist = dentist;
    this.treatmentData.observations = observations;
    this.treatmentData.specs = specs;

};

Engine.prototype.createHeader = function () {

    var seperation = 18;

    this.renderer.renderTextCenter16("Odontogram",
        this.renderer.width / 2,
        seperation,
        this.settings.COLOR_TEXT);

    seperation = 20;


    this.renderer.renderText14("Office",
        4,
        seperation * 2,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14(": " + this.treatmentData.office,
        100,
        seperation * 2,
        this.settings.COLOR_TEXT);


    this.renderer.renderText14("Patient",
        4,
        seperation * 3,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14(": " + this.treatmentData.patient,
        100,
        seperation * 3,
        this.settings.COLOR_TEXT);


    this.renderer.renderText14("Appoint No.",
        4,
        seperation * 4,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14(": " + this.treatmentData.treatmentNumber,
        100,
        seperation * 4,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14("Date",
        this.renderer.width / 2,
        seperation * 4,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14(": " + this.treatmentData.treatmentDate,
        this.renderer.width / 2 + 120,
        seperation * 4,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14("Dentist",
        4,
        seperation * 5,
        this.settings.COLOR_TEXT);

    this.renderer.renderText14(": " + this.treatmentData.dentist,
        100,
        seperation * 5,
        this.settings.COLOR_TEXT);

};

/**
 * Method to draw a print preview image of the odontogram.
 * This method draws all the teeth in the odotogram.
 * @returns {void}
 */
Engine.prototype.printPreview = function () {

    this.renderer.clear(this.settings);

    this.createHeader();

    this.renderer.render(this.odontAdult, this.settings, this.constants);
    this.renderer.render(this.odontSpacesAdult, this.settings, this.constants);
    this.renderer.render(this.odontChild, this.settings, this.constants);
    this.renderer.render(this.odontSpacesChild, this.settings, this.constants);

    if (this.settings.DEBUG) {

        this.renderer.renderText("DEBUG MODE", 2, 15, this.settings.COLOR_TEXT);

        this.renderer.renderText("X: " + this.cursorX + ", Y: " + this.cursorY,
            128, 15, this.settings.COLOR_TEXT);
    }

    this.renderer.renderText("Specifications: ", 4, 1200, this.settings.COLOR_TEXT);

    this.renderer.wrapText(this.treatmentData.specs, 8, 1222, this.renderer.width - 8, 14, 5);

    this.renderer.renderText("Observations: ", 4, 1300, this.settings.COLOR_TEXT);

    this.renderer.wrapText(this.treatmentData.observations, 8, 1322, this.renderer.width - 8, 14, 5);
};

Engine.prototype.print = function () {

    var dataUrl = document.getElementById('canvas').toDataURL();

    var windowContent = '<!DOCTYPE html>';
    windowContent += '<html lang="en">';
    windowContent += '<head>';
    windowContent += '<meta charset="utf-8"/>';
    windowContent += '<title>OIM Odontograma</title>';
    windowContent += '</head>';
    windowContent += '<body >';
    windowContent += '<p style="text-align: center;"><img src="' + dataUrl + '"></p>';
    windowContent += '</body>';
    windowContent += '</html>';

    var printWin = window.open('', '', 'width=' + screen.availWidth + ',height=' + screen.availHeight);
    printWin.document.open();
    printWin.document.write(windowContent);

    printWin.document.addEventListener('load', function () {
        printWin.focus();
        printWin.print();
        printWin.document.close();
        printWin.close();
    }, true);

    this.preview = false;
    this.hidePrintPreview();
};


Engine.prototype.createMenu = function () {

    let buttonWidth = 130;
    let buttonHeight = 25;
    let startX = (this.canvas.width / 2) - ((buttonWidth * 6) / 2);

    let posY = 10;
    let ySeparator = 0;

    let posX = startX;
    let xSeparator = buttonWidth;

    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Caries", 1);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Corona", 2);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Corona (Temp)", 3);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Ausente", 4);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Fractura", 5);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Diastema", 8);

    posY = posY + buttonHeight + ySeparator;
    posX = startX;

    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Empaste", 11);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Prótesis Rem", 12);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Migración", 13);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Rotación", 14);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Fusión", 15);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Remanente R", 16);

    posY = posY + buttonHeight + ySeparator;
    posX = startX;

    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "No Erupcionado", 24);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Transposición", 25);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Supernumerario", 27);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Daño Pulpar", 28);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Carilla", 29);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Poste", 30);

    posY = posY + buttonHeight + ySeparator;
    posX = startX;

    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Orto Fijo", 32);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Prótesis Fija", 34);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Implante", 6);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Macrodoncia", 17);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Microdoncia", 18);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Discrómico", 22);

    posY = posY + buttonHeight + ySeparator;
    posX = startX;

    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Desgastado", 37);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Semi-Impactado", 38);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Intrusión", 20);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Edéntulismo", 31);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Ectópico", 21);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Impactado", 19);

    posY = posY + buttonHeight + ySeparator;
    posX = startX;

    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Endodoncia", 23);
    posX = posX + xSeparator;
    this.createMenuButton(posX, posY, buttonWidth, buttonHeight, "Extrusión", 9);
    posX = posX + xSeparator;
}

Engine.prototype.createMenuButton = function (x, y, width, height, text, id) {
    var menuitem = new MenuItem();
    menuitem.setUp(x, y, width, height);
    menuitem.textBox.text = text
    menuitem.id = id;
    this.menuItems.push(menuitem);
}

/**
 * Método unificado para obtener datos del odontograma
 * Normaliza la estructura de datos para ambos tipos (inicial y clínico)
 * @returns {Array} Array de entradas normalizadas del odontograma
 */
Engine.prototype.getUnifiedOdontogramData = function() {
    "use strict";
    
    var entries = [];
    var currentDate = getCurrentDateFormatted();
    
    // Procesar dientes
    this.processTeethData(this.mouth, entries, currentDate);
    
    // Procesar espacios
    this.processSpacesData(this.spaces, entries, currentDate);
    
    return entries;
};

/**
 * Función auxiliar para procesar datos de dientes
 * @param {Array} teeth - Array de dientes
 * @param {Array} entries - Array donde agregar las entradas
 * @param {String} currentDate - Fecha actual formateada
 */
Engine.prototype.processTeethData = function(teeth, entries, currentDate) {
    "use strict";
    
    for (var i = 0; i < teeth.length; i++) {
        var tooth = teeth[i];
        if (!tooth) continue;
        
        // Procesar daños del diente
        for (var j = 0; j < tooth.damages.length; j++) {
            var damage = tooth.damages[j];
            if (!damage) continue;
            
            entries.push({
                tooth: tooth.id,
                damage: String(damage.id || damage.value),
                surface: damage.surface || '0',
                note: damage.note || '',
                fecha: damage.fecha || currentDate
            });
        }
        
        // Procesar superficies (checkboxes)
        for (var k = 0; k < tooth.checkBoxes.length; k++) {
            var checkbox = tooth.checkBoxes[k];
            if (!checkbox || checkbox.state <= 0) continue;
            
            entries.push({
                tooth: tooth.id,
                damage: String(checkbox.state),
                surface: checkbox.id.split('_')[1] || '0',
                note: tooth.textBox ? tooth.textBox.text : '',
                fecha: checkbox.fecha || currentDate
            });
        }
    }
};

/**
 * Función auxiliar para procesar espacios
 * @param {Array} spaces - Array de espacios
 * @param {Array} entries - Array donde agregar las entradas
 * @param {String} currentDate - Fecha actual formateada
 */
Engine.prototype.processSpacesData = function(spaces, entries, currentDate) {
    "use strict";
    
    for (var i = 0; i < spaces.length; i++) {
        var space = spaces[i];
        if (!space || !space.damages) continue;
        
        for (var j = 0; j < space.damages.length; j++) {
            var damage = space.damages[j];
            if (!damage) continue;
            
            entries.push({
                tooth: space.id,
                damage: String(damage.id || damage.value),
                surface: '0',
                note: '',
                fecha: damage.fecha || currentDate
            });
        }
    }
};

/**
 * Evento único para guardar odontograma
 * Unifica el guardado para ambos tipos (inicial y clínico)
 * @param {String} type - Tipo de odontograma ('inicial' | 'clinico')
 * @param {String} imageData - Datos de imagen (opcional, solo para inicial)
 */
Engine.prototype.dispatchSaveEvent = function(type, imageData) {
    "use strict";
    
    var data = this.getUnifiedOdontogramData();
    
    var eventDetail = {
        tipo: type, // "inicial" | "clinico"
        entries: data,
        patientId: this.patientId,
        timestamp: new Date().toISOString()
    };
    
    if (imageData) {
        eventDetail.imageData = imageData;
    }
    
    // Evento unificado para ambos tipos
    var event = new CustomEvent('odontogramSave', {
        detail: eventDetail
    });
    
    document.dispatchEvent(event);
    console.log('Evento odontogramSave disparado para tipo:', type);
};
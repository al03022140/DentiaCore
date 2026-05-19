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
 * Helper class for creating a Odontograma
 * @returns {OdontogramaGenerator}
 */
function OdontogramaGenerator() {
    "use strict";
    // variable for how many images have been loaded
    this.currentLoad = 0;

    // variable for how many teeths are in array
    this.arrayCount = 0;
    this.seperator = 210;
    this.imgWidth = 50;
    this.imgHeight = 90;
    this.engine = null;
    this.settings = null;
    this.constants = null;

}

// Mapeo FDI permanente -> nombre de archivo del periodontograma.
// Los assets en /images/Periodontogram/tooth/ usan posiciones 1..17 saltando el 9
// (esa "posición vacía" separa visualmente los cuadrantes en el periodontograma).
OdontogramaGenerator.prototype.getToothImagePath = function (fdi) {
    "use strict";
    var permanentUpper = {
        18: 1, 17: 2, 16: 3, 15: 4, 14: 5, 13: 6, 12: 7, 11: 8,
        21: 10, 22: 11, 23: 12, 24: 13, 25: 14, 26: 15, 27: 16, 28: 17
    };
    var permanentLower = {
        48: 1, 47: 2, 46: 3, 45: 4, 44: 5, 43: 6, 42: 7, 41: 8,
        31: 10, 32: 11, 33: 12, 34: 13, 35: 14, 36: 15, 37: 16, 38: 17
    };
    if (permanentUpper[fdi]) {
        return "/images/Periodontogram/tooth/up" + permanentUpper[fdi] + ".png";
    }
    if (permanentLower[fdi]) {
        return "/images/Periodontogram/tooth/down" + permanentLower[fdi] + ".png";
    }
    // Fallback: dentición temporal mantiene los assets actuales
    var section = (fdi >= 51 && fdi <= 65) ? "sup" : "inf";
    return "/images/dentadura-" + section + "-" + fdi + ".png";
};

// Mapeo FDI permanente -> imagen de IMPLANTE del periodontograma. Se usa cuando el
// diente tiene aplicado el damage IMPLANTE (id=6) para reemplazar visualmente la
// pieza dental por la representación de implante. Retorna null para temporales.
OdontogramaGenerator.prototype.getImplantImagePath = function (fdi) {
    "use strict";
    var permanentUpper = {
        18: 1, 17: 2, 16: 3, 15: 4, 14: 5, 13: 6, 12: 7, 11: 8,
        21: 10, 22: 11, 23: 12, 24: 13, 25: 14, 26: 15, 27: 16, 28: 17
    };
    var permanentLower = {
        48: 1, 47: 2, 46: 3, 45: 4, 44: 5, 43: 6, 42: 7, 41: 8,
        31: 10, 32: 11, 33: 12, 34: 13, 35: 14, 36: 15, 37: 16, 38: 17
    };
    if (permanentUpper[fdi]) {
        return "/images/Periodontogram/implant/up" + permanentUpper[fdi] + ".png";
    }
    if (permanentLower[fdi]) {
        return "/images/Periodontogram/implant/down" + permanentLower[fdi] + ".png";
    }
    return null;
};

// Helper para precargar la imagen de implante asociada a un Tooth.
// Se invoca tras asignar tooth.image en cada loop de prepareOdontograma*.
OdontogramaGenerator.prototype.attachImplantImage = function (tooth, fdi) {
    "use strict";
    var path = this.getImplantImagePath(fdi);
    if (!path) return;
    var img = new Image();
    img.src = path;
    tooth.implantImage = img;
};

/**
 * Method to set reference to the engine which uses this 
 * odontograma
 * @param {type} engine
 * @returns {undefined}
 */
OdontogramaGenerator.prototype.setEngine = function (engine) {
    "use strict"; 
    this.engine = engine;
};

/** 
 * Method to set reference to settings
 * @param {type} settings application settings
 * @returns {undefined}
 */
OdontogramaGenerator.prototype.setSettings = function (settings) {
    "use strict";
    this.settings = settings;
};

OdontogramaGenerator.prototype.setConstants = function (constants) {
    "use strict";
    this.constants = constants;
};


/**
 * Method to update the count of images which have been loaded
 * @returns {void}
 */
OdontogramaGenerator.prototype.updateLoad = function () {
    "use strict";
    this.currentLoad++;
    console.log("Imagen cargada: " + this.currentLoad + "/" + this.arrayCount);

    // Si ya se cargaron todas las imágenes, iniciar el engine
    if (this.currentLoad >= this.arrayCount) {
        console.log("Todas las imágenes cargadas, iniciando engine");
        this.engine.start();
    }
};


/*'
 * Method to prepare an Odontograma for an adult, 32 teeth
 * @param {type} odontograma array which holds all 32 teeth
 * @param {type} spaces array to hold all the spaces between teeths
 * @param {type} canvas the canvas where the odontograma will be drawn
 * @returns {void}
 */
OdontogramaGenerator.prototype.prepareOdontogramaAdult = function (odontograma,
        spaces, canvas, yOffset) {
    "use strict";
    
    // Establecer valor predeterminado después de la directiva strict
    yOffset = yOffset || 0;
    
    var self = this;
    this.arrayCount = 0;

    // center the ondotograma horizontal — usar dimensiones LÓGICAS (canvas físico
    // puede estar escalado por DPR, pero el layout va en coords lógicas)
    var width = canvas._logicalWidth || canvas.width;
    var odontWidth = 16 * this.imgWidth;
    var start = (width - odontWidth) / 2;

    // start of first tooth
    var x = start;

    // center vertial
    var height = canvas._logicalHeight || canvas.height;
    var odontHeight = 2 * 80;
    var base = (height - odontHeight) / 2 + yOffset;
    

    // create the 1st group of upper teeth
    for (var i = 18; i > 10; i--) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i > 13)
        {
            tooth.setSurfaces(5);

        } else
        {
            tooth.setSurfaces(4);
        }

        var image = new Image();

        image.onload = function () {
            self.updateLoad();
        };
        
        image.onerror = function () {
            console.error("Error al cargar imagen: " + this.src);
            // Actualizar contador incluso si hay error para que el engine pueda iniciar
            self.updateLoad();
        };

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);
        
        tooth.setDimens(x,
                        base, 
                        this.imgWidth,
                        this.imgHeight);
                        
        tooth.setType(0);

        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        odontograma[this.arrayCount] = tooth;

        tooth.address = this.arrayCount;

        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        var space = new Tooth();
        space.setConstants(this.constants);
        
        space.setSurfaces(5);

        if (i !== 11) {
            var tmpid = (i) + "" + (i - 1);
            space.id = Number(tmpid);

        } else {

            var tmpid = (i) + "" + (21);
            space.id = Number(tmpid);

        }

        space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                        tooth.rect.y,
                        tooth.rect.width,
                        tooth.rect.height);

        space.type = tooth.type;
        space.tooth = false;

        spaces.push(space);

    }

    // create the 2nd group of upper teeth
    for (var i = 21; i < 29; i++) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i < 24)
        {
            tooth.setSurfaces(4);
        } else
        {
            tooth.setSurfaces(5);
        }

        var image = new Image();

        image.onload = function () {
            self.updateLoad();
        };
        
        image.onerror = function () {
            console.error("Error al cargar imagen: " + this.src);
            // Actualizar contador incluso si hay error para que el engine pueda iniciar
            self.updateLoad();
        };

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);
        
        tooth.setDimens(x, 
                        base,
                        this.imgWidth, 
                        this.imgHeight);
                        
        tooth.setType(0);

        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        odontograma[this.arrayCount] = tooth;

        tooth.address = this.arrayCount;

        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        if (i < 28) {

            var space = new Tooth();
            space.setConstants(this.constants);
            space.setSurfaces(5);
            var tmpid = (i) + "" + (i + 1);
            space.id = Number(tmpid);

            space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                            tooth.rect.y,
                            tooth.rect.width,
                            tooth.rect.height);

            space.type = tooth.type;
            space.tooth = false;

            spaces.push(space);
        }
    }

    // start position of first 
    var x = start;

    // create the 1st group of lower teeth
    for (var i = 48; i > 40; i--) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i < 44)
        {
            tooth.setSurfaces(4);

        } else
        {
            tooth.setSurfaces(5);
        }

        var image = new Image();

        image.onload = function () {
            self.updateLoad();
        };
        
        image.onerror = function () {
            console.error("Error al cargar imagen: " + this.src);
            // Actualizar contador incluso si hay error para que el engine pueda iniciar
            self.updateLoad();
        };

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);

        tooth.setDimens(x,
                        base + this.seperator,
                        this.imgWidth,
                        this.imgHeight);

        tooth.setType(1);

        x += tooth.rect.width+ this.settings.TOOTH_PADDING;

        odontograma[this.arrayCount] = tooth;

        tooth.address = this.arrayCount;

        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        var space = new Tooth();
        space.setConstants(this.constants);
        space.setSurfaces(5);

        if (i !== 41) {
            var tmpid = (i) + "" + (i - 1);
            space.id = Number(tmpid);

        } else {

            var tmpid = (i) + "" + (31);
            space.id = Number(tmpid);

        }

        space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                        tooth.rect.y,
                        tooth.rect.width,
                        tooth.rect.height);

        space.type = tooth.type;
        space.tooth = false;

        spaces.push(space);

    }

    // create the 2nd group of lower teeth
    for (var i = 31; i < 39; i++) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);
        
        if (i < 34)
        {
            tooth.setSurfaces(4);
        } else
        {
            tooth.setSurfaces(5);
        }

        var image = new Image();

        image.onload = function () {
            self.updateLoad();
        };
        
        image.onerror = function () {
            console.error("Error al cargar imagen: " + this.src);
            // Actualizar contador incluso si hay error para que el engine pueda iniciar
            self.updateLoad();
        };

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);
        tooth.setDimens(x,
                        base + this.seperator,
                        this.imgWidth,
                        this.imgHeight);

        tooth.setType(1);

        odontograma[this.arrayCount] = tooth;
        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        tooth.address = this.arrayCount;
        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        if (i < 38) {

            var space = new Tooth();
            space.setConstants(this.constants);
            space.setSurfaces(5);
            var tmpid = (i) + "" + (i + 1);
            space.id = Number(tmpid);

            space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                            tooth.rect.y,
                            tooth.rect.width,
                            tooth.rect.height);

            space.type = tooth.type;
            space.tooth = false;

            spaces.push(space);
        }

    }

};


/**
 * Method to prepare an odontograma for a child
 * @param {type} odontograma container for the odontograma, teeths
 * @param {type} spaces container for the spaces between teeth
 * @param {type} canvas the canvas where the odontograma will be drawn on
 * @returns {void}
 */
OdontogramaGenerator.prototype.prepareOdontogramaChild = function (odontograma,
spaces, canvas) {
    "use strict";
    var self = this;
    this.arrayCount = 0;

    // center odontograma horizontal — usar dimensiones LÓGICAS
    var width = canvas._logicalWidth || canvas.width;
    var odontWidth = 10 * this.imgWidth;
    var start = (width - odontWidth) / 2;

    // start of first tooth
    var x = start;

    // center odontograma vertical
    var height = canvas._logicalHeight || canvas.height;
    var odontHeight = 2 * 80;
    var base = (height - odontHeight) / 2;

    for (var i = 55; i > 50; i--) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i > 53)
        {
            tooth.setSurfaces(5);

        } else
        {
            tooth.setSurfaces(4);
        }

        var image = new Image();

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);

        tooth.setDimens(x,
                        base,
                        this.imgWidth,
                        this.imgHeight);

        tooth.setType(0);

        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        odontograma[this.arrayCount] = tooth;

        tooth.address = this.arrayCount;

        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        var space = new Tooth();
        space.setConstants(this.constants);
        space.setSurfaces(5);

        if (i !== 51) {
            var tmpid = (i) + "" + (i - 1);
            space.id = Number(tmpid);

        } else {

            var tmpid = (i) + "" + (61);
            space.id = Number(tmpid);

        }

        space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                        tooth.rect.y,
                        tooth.rect.width,
                        tooth.rect.height);

        space.type = tooth.type;
        space.tooth = false;

        spaces.push(space);

    }

    for (var i = 61; i < 66; i++) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i < 64)
        {
            tooth.setSurfaces(4);
        } else
        {
            tooth.setSurfaces(5);
        }

        var image = new Image;

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);

        tooth.setDimens(x,
                        base,
                        this.imgWidth,
                        this.imgHeight);

        tooth.setType(0);

        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        tooth.address = this.arrayCount;

        odontograma[this.arrayCount] = tooth;

        this.arrayCount++;

        tooth.createSurfaces(this.settings);


        if (i < 65) {

            var space = new Tooth();
            space.setConstants(this.constants);
            
            space.setSurfaces(5);
            var tmpid = (i) + "" + (i + 1);
            space.id = Number(tmpid);

            space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                            tooth.rect.y,
                            tooth.rect.width,
                            tooth.rect.height);

            space.type = tooth.type;
            space.tooth = false;

            spaces.push(space);
        }

    }

    // start position of first 
    var x = start;

    for (var i = 85; i > 80; i--) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i < 84)
        {
            tooth.setSurfaces(4);

        } else
        {
            tooth.setSurfaces(5);
        }


        var image = new Image();

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);

        tooth.setDimens(x,
                        base + this.seperator,
                        this.imgWidth,
                        this.imgHeight);

        tooth.setType(1);

        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        odontograma[this.arrayCount] = tooth;

        tooth.address = this.arrayCount;

        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        var space = new Tooth();
        space.setConstants(this.constants);
        space.setSurfaces(5);

        if (i !== 81) {
            var tmpid = (i) + "" + (i - 1);
            space.id = Number(tmpid);

        } else {

            var tmpid = (i) + "" + (71);
            space.id = Number(tmpid);

        }

        space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                        tooth.rect.y,
                        tooth.rect.width,
                        tooth.rect.height);

        space.type = tooth.type;
        space.tooth = false;

        spaces.push(space);

    }

    for (var i = 71; i < 76; i++) {

        var tooth = new Tooth();
        tooth.setConstants(this.constants);

        if (i < 74)
        {
            tooth.setSurfaces(4);
        } else
        {
            tooth.setSurfaces(5);
        }

        var image = new Image();

        image.src = self.getToothImagePath(i);

        tooth.id = i;
        tooth.image = image;
        self.attachImplantImage(tooth, i);
        tooth.setDimens(x,
                        base + this.seperator,
                        this.imgWidth,
                        this.imgHeight);

        tooth.setType(1);

        odontograma[this.arrayCount] = tooth;
        x += tooth.rect.width + this.settings.TOOTH_PADDING;

        tooth.address = this.arrayCount;
        this.arrayCount++;

        tooth.createSurfaces(this.settings);

        if (i < 75) {

            var space = new Tooth();
            space.setConstants(this.constants);
             
            space.setSurfaces(5);
            var tmpid = (i) + "" + (i + 1);
            space.id = Number(tmpid);

            space.setDimens(tooth.rect.x + tooth.rect.width / 2,
                            tooth.rect.y,
                            tooth.rect.width,
                            tooth.rect.height);

            space.type = tooth.type;
            space.tooth = false;

            spaces.push(space);
        }

    }

};

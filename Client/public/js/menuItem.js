

/**
 * Base class for tooth
 * @returns {MenuItem}
 */
function MenuItem() {
    "use strict";
    this.active = false;
    this.id = 0;
    this.tooth = true;
    this.surfaces = 0;
    this.highlight = false;
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


MenuItem.prototype.setUp = function (x, y, width, height) {
    "use strict";

    this.rect.x = x;
    this.rect.y = y;
    this.rect.width = width;
    this.rect.height = height;

    this.textBox.rect.x = x;
    this.textBox.rect.y = y;
    this.textBox.rect.width = width;
    this.textBox.rect.height = height;

};


/**
 * Method to render a Tooth on the screen with all its states
 * @param {type} context the canvas to draw on
 * @param {type} settings app settings
 * @param {type} constants application constants
 * @returns {undefined}
 */
MenuItem.prototype.render = function (context, settings, constants) {
    "use strict";

    if (this.active) {
        this.renderStateActive(context, settings);
    } else {
        this.renderStateNormal(context, settings);
    }

    if(this.highlight) {
        this.renderStateFocus(context, settings);
    } 

    this.renderLabel(context, settings);
};


MenuItem.prototype.renderStateNormal = function (context, settings) {
    "use strict";


    var portion = this.rect.height / 5;

    context.beginPath();
    context.globalAlpha = 1;
    context.fillStyle = settings ? settings.COLOR_MENU_BG : "#ebf3f5";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);

    context.fillStyle = settings ? settings.COLOR_MENU_TOP : "#f9fbfc";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, portion);

    context.fillStyle = settings ? settings.COLOR_MENU_LINE : "#f9f9f9";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, 1);

    context.fillStyle = settings ? settings.COLOR_MENU_BOTTOM : "#e5eef1";
    context.fillRect(this.rect.x, this.rect.y + (portion * 4), this.rect.width, portion);

    context.fillStyle = settings ? settings.COLOR_MENU_BOTTOM_LINE : "#e9eef0";
    context.fillRect(this.rect.x, this.rect.y + (this.rect.height -1), this.rect.width, 1);

    context.globalAlpha = 1;

    this.rect.outline(context, settings ? settings.COLOR_MENU_OUTLINE : "#35353f")

    context.restore();

};

MenuItem.prototype.renderStateActive = function (context, settings) {
    "use strict";


    var portion = this.rect.height / 5;

    context.beginPath();
    context.globalAlpha = 1;
    context.fillStyle = settings ? settings.COLOR_MENU_ACTIVE_BG : "#ace8d1";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);

    context.fillStyle = settings ? settings.COLOR_MENU_ACTIVE_TOP : "#bef7e1";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, portion);

    context.fillStyle = settings ? settings.COLOR_MENU_ACTIVE_LINE : "#dafff1";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, 1);

    context.fillStyle = settings ? settings.COLOR_MENU_ACTIVE_BOTTOM : "#8fd6bb";
    context.fillRect(this.rect.x, this.rect.y + (portion * 4), this.rect.width, portion);

    context.fillStyle = settings ? settings.COLOR_MENU_ACTIVE_BOTTOM_LINE : "#6db096";
    context.fillRect(this.rect.x, this.rect.y + (this.rect.height -1), this.rect.width, 1);

    context.globalAlpha = 1;

    this.rect.outline(context, settings ? settings.COLOR_MENU_OUTLINE : "#35353f")

    context.restore();

};


MenuItem.prototype.renderStateFocus = function (context, settings) {
    "use strict";

    context.beginPath();
    context.globalAlpha = 0.5;
    context.fillStyle = "#b2dee7";
    context.fillRect(this.rect.x, this.rect.y, this.rect.width, this.rect.height);
    context.globalAlpha = 1.0;
    this.rect.outline(context, settings ? settings.COLOR_MENU_OUTLINE : "#35353f")
    context.restore();

};

MenuItem.prototype.renderLabel = function (context, settings) {
    "use strict";

    // Set text properties
    context.globalAlpha = 1;
    context.textAlign = "center";
    context.fillStyle = settings ? settings.COLOR_TEXT : "#000000";
    context.font = "500 15px Montserrat";

    // Calculate vertical centering
    const textMetrics = context.measureText(this.textBox.text);
    const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
    const yPosition = this.rect.y + (this.rect.height / 2) + (textHeight / 2);

    // Draw text
    context.fillText(
        this.textBox.text,
        this.rect.x + this.rect.width / 2,
        yPosition
    );

    context.stroke();
    context.restore();
};
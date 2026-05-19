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
 * Settings class for the application.
 * This class contains all the values, which are not 
 * fixed in the engine.
 * @returns {Settings}
 */
function Settings() {
    "use strict";
    // app settings
    this.DEBUG = false;
    this.HIHGLIGHT_SPACES = false;
    this.TOOTH_PADDING = 0;
    this.RECT_DIMEN = 10;
    
    // colors
    this.COLOR_ON_TOUCH = "#FF8B00";
    this.COLOR_HIGHLIGHT = "#00AEFF";
    this.COLOR_RED = "#ff0000";
    this.COLOR_BLUE = "#0052ff";
    this.COLOR_BLACK = "#000000";
    this.COLOR_HIGHLIGHT_BAD = "#FF0000";

    // Theme-aware colors (will be updated by detectTheme)
    this.COLOR_BG = "#ffffff";
    this.COLOR_TEXT = "#000000";
    this.COLOR_OUTLINE = "#000000";
    this.COLOR_LABEL = "#9a9a9a";
    this.COLOR_TEXTBOX_BG = "#ffffff";

    // Menu item normal state colors
    this.COLOR_MENU_BG = "#ebf3f5";
    this.COLOR_MENU_TOP = "#f9fbfc";
    this.COLOR_MENU_LINE = "#f9f9f9";
    this.COLOR_MENU_BOTTOM = "#e5eef1";
    this.COLOR_MENU_BOTTOM_LINE = "#e9eef0";
    this.COLOR_MENU_OUTLINE = "#35353f";

    // Apply theme
    this.detectTheme();
}

/**
 * Detect current theme and update colors accordingly
 */
Settings.prototype.detectTheme = function () {
    "use strict";
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    if (isDark) {
        /*
         * Tema oscuro del odontograma: el área de dibujo va en oscuro
         * (#1e1e1e, mismo --figma-bg-card del resto de la app) y los dientes
         * + trazos en claro para que tengan contraste. Los botones dibujados
         * por el motor (Adulto/Niño/Guardar) conservan el color claro
         * tipico del modo claro — pedido del usuario: "los botones dejarlos
         * con el color que estan usualmente".
         */
        this.COLOR_BG = "#1e1e1e";
        this.COLOR_TEXT = "#e0e0e0";
        this.COLOR_OUTLINE = "#cfcfcf";
        this.COLOR_LABEL = "#a0a0a0";
        this.COLOR_TEXTBOX_BG = "#1e1e1e";

        this.COLOR_MENU_BG = "#ebf3f5";
        this.COLOR_MENU_TOP = "#f9fbfc";
        this.COLOR_MENU_LINE = "#f9f9f9";
        this.COLOR_MENU_BOTTOM = "#e5eef1";
        this.COLOR_MENU_BOTTOM_LINE = "#e9eef0";
        this.COLOR_MENU_OUTLINE = "#35353f";
    } else {
        this.COLOR_BG = "#ffffff";
        this.COLOR_TEXT = "#000000";
        this.COLOR_OUTLINE = "#000000";
        this.COLOR_LABEL = "#9a9a9a";
        this.COLOR_TEXTBOX_BG = "#ffffff";

        this.COLOR_MENU_BG = "#ebf3f5";
        this.COLOR_MENU_TOP = "#f9fbfc";
        this.COLOR_MENU_LINE = "#f9f9f9";
        this.COLOR_MENU_BOTTOM = "#e5eef1";
        this.COLOR_MENU_BOTTOM_LINE = "#e9eef0";
        this.COLOR_MENU_OUTLINE = "#35353f";
    }
};
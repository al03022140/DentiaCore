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
         * Área de dibujo clínico: fondo blanco para ver dientes y trazos como en papel.
         * Los botones del motor (Adulto/Niño/Guardar) siguen con tema oscuro abajo.
         */
        this.COLOR_BG = "#ffffff";
        this.COLOR_TEXT = "#000000";
        this.COLOR_OUTLINE = "#1a1a1a";
        this.COLOR_LABEL = "#6b6b6b";
        this.COLOR_TEXTBOX_BG = "#ffffff";

        this.COLOR_MENU_BG = "#2a2a2a";
        this.COLOR_MENU_TOP = "#333333";
        this.COLOR_MENU_LINE = "#2e2e2e";
        this.COLOR_MENU_BOTTOM = "#222222";
        this.COLOR_MENU_BOTTOM_LINE = "#1a1a1a";
        this.COLOR_MENU_OUTLINE = "#555555";
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
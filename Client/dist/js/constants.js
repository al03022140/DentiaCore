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
 * Helper class for holding id of damages 
 * which can be added to the odontograma
 * @returns {Constants}
 */
function Constants() {
    "use strict";
    // Damages for drawing - Actualizados para coincidir con engine.js
    this.CARIES = 1;
    this.CORONA = 2;
    this.CORONA_TEMP = 3;
    this.AUSENTE = 4;
    this.FRACTURA = 5;
    this.IMPLANTE = 6;
    this.EXTRUSION = 9;
    this.EMPASTE = 11;
    this.PROTESIS_REM = 12;
    this.MIGRACION = 13;
    this.ROTACION = 14;
    this.FUSION = 15;
    this.REMANENTE_R = 16;
    this.MACRODONCIA = 17;
    this.MICRODONCIA = 18;
    this.IMPACTADO = 19;
    this.INTRUSION = 20;
    this.ECTOPICO = 21;
    this.DISCROMICO = 22;
    this.ENDODONCIA = 23;
    this.NO_ERUPCIONADO = 24;
    this.TRANSPOSICION = 25;
    this.SUPERNUMERARIO = 27;
    this.DANO_PULPAR = 28;
    this.CARILLA = 29;
    this.POSTE = 30;
    this.EDENTULISMO = 31;
    this.ORTO_FIJO = 32;
    this.PROTESIS_FIJA = 34;
    this.DESGASTADO = 37;
    this.SEMI_IMPACTADO = 38;
    this.DIASTEMA = 8;

    // Constantes adicionales para compatibilidad
    this.CORONA_DEFINITIVA = 2; // Alias para CORONA
    this.CORONA_TEMPORAL = 3;   // Alias para CORONA_TEMP
    this.DIENTE_AUSENTE = 4;    // Alias para AUSENTE
    this.DIENTE_EXTRUIDO = 9;   // Alias para EXTRUSION
    this.CURACION = 11;         // Alias para EMPASTE
    this.PROTESIS_REMOVIBLE = 12; // Alias para PROTESIS_REM
    this.GIROVERSION = 14;      // Alias para ROTACION
    this.REMANENTE_RADICULAR = 16; // Alias para REMANENTE_R
    this.IMPACTACION = 19;      // Alias para IMPACTADO
    this.DIENTE_INTRUIDO = 20;  // Alias para INTRUSION
    this.DIENTE_ECTOPICO = 21;  // Alias para ECTOPICO
    this.DIENTE_DISCR0MICO = 22; // Alias para DISCROMICO
    this.DIENTE_EN_ERUPCION = 24; // Alias para NO_ERUPCIONADO
    this.TRANSPOSICION_LEFT = 25; // Alias para TRANSPOSICION
    this.TRANSPOSICION_RIGHT = 26; // Alias para TRANSPOSICION
    this.SUPER_NUMERARIO = 27;  // Alias para SUPERNUMERARIO
    this.PULPAR = 28;           // Alias para DANO_PULPAR
    this.PERNO_MUNON = 30;      // Alias para POSTE
    this.EDENTULOA_TOTAL = 31;  // Alias para EDENTULISMO
    this.ORTODONTICO_FIJO_END = 32; // Alias para ORTO_FIJO
    this.ORTODONTICO_FIJO_CENTER = 33; // Constante adicional
    this.PROTESIS_FIJA_LEFT = 34; // Alias para PROTESIS_FIJA
    this.PROTESIS_FIJA_CENTER = 35; // Constante adicional
    this.PROTESIS_FIJA_RIGHT = 36; // Constante adicional
    this.SUPERFICIE_DESGASTADA = 37; // Alias para DESGASTADO
    this.SEMI_IMPACTACI0N = 38; // Alias para SEMI_IMPACTADO


    this.all = [
        this.CARIES,
        this.CORONA,
        this.CORONA_TEMP,
        this.AUSENTE,
        this.FRACTURA,
        this.IMPLANTE,
        this.DIASTEMA,
        this.EXTRUSION,
        this.EMPASTE,
        this.PROTESIS_REM,
        this.MIGRACION,
        this.ROTACION,
        this.FUSION,
        this.REMANENTE_R,
        this.MACRODONCIA,
        this.MICRODONCIA,
        this.IMPACTADO,
        this.INTRUSION,
        this.ECTOPICO,
        this.DISCROMICO,
        this.ENDODONCIA,
        this.NO_ERUPCIONADO,
        this.TRANSPOSICION,
        this.SUPERNUMERARIO,
        this.DANO_PULPAR,
        this.CARILLA,
        this.POSTE,
        this.EDENTULISMO,
        this.ORTO_FIJO,
        this.PROTESIS_FIJA,
        this.PROTESIS_FIJA_CENTER,
        this.PROTESIS_FIJA_RIGHT,
        this.DESGASTADO,
        this.SEMI_IMPACTADO
    ];
    /**
     * Method to check if a damage is writable, is text only
     * @param {type} arg id of the damage
     * @returns {Boolean} true if this damage is only text, else false
     */
    this.isWritable = function (arg) {

        var match = false;

        if (arg === this.DIENTE_DISCR0MICO) {
            match = true;
        } else if (arg === this.DIENTE_ECTOPICO) {
            match = true;
        } else if (arg === this.IMPACTACION) {
            match = true;
        } else if (arg === this.MACRODONCIA) {
            match = true;
        } else if (arg === this.MICRODONCIA) {
            match = true;
        } else if (arg === this.SEMI_IMPACTACI0N) {
            match = true;
        } else if (arg === this.SUPERFICIE_DESGASTADA) {
            match = true;
        }

        return match;
    };

    this.isDiagnostic = function (arg) {

        var match = false;

        for(var i = 0; i < this.all.length; i++)
        {
            if(this.all[i] === arg){
                match = true;
                break;
            }
            
        }

        return match;
    };
}
;


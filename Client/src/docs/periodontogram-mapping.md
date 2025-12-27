# Periodontogram mapping: UI ↔ Unified backend schema

This document explains how the Patient Detail periodontogram maps UI data to the unified backend schema without losing information.

## Models

- UI model (English keys, four faces per tooth):
  - Faces: vestibularSuperior, palatinoSuperior, vestibularInferior, lingualInferior
  - Metrics per face: plaque, bleeding, suppuration, gingivalMargin, probingDepth (triples [a,b,c])
  - Tooth fields: absent/ausente, implant/implante, mobility/movilidad, gumWidth/anchuraEncia, prognosis/pronostico, furca

- Backend unified model (Spanish keys, two faces):
  - numeroDiente
  - vestibular, palatino → each has: placa, sangrado, supuracion, margenGingival, profundidadSondaje (triples)
  - ausente, implante, movilidad, anchuraEncia, pronostico, furca { vestibular, lingual, mesial }

## Save flow

- Orchestrated in `features/patient-detail/components/periodontogram-section.jsx` → `handleSave`.
- Helpers in `shared/utils/periodontogram-helpers.js`:
  - toTriple(arr): normalize to [a,b,c]
  - pickFaceTriplesFromFourFaces(uiMetricByFace, isUpperTooth): derive { vestibular, palatino } from UI faces
  - normalizeFaceObj(face): ensure every metric triple exists and is numeric
- Mapping per tooth:
  1) Derive metrics per face from UI four faces into two faces (vestibular/palatino)
  2) Fallback to nested `vestibular`/`palatino` legacy objects if present
  3) Map simple fields with Spanish canonical keys; mirror es/en in UI state to keep visualization consistent
  4) Furca: supports consolidated or split inputs; normalizes to { vestibular, lingual, mesial } with 0..3 bounds
- Validate payload with `validatePeriodontogramData` (unified schema)
- Recompute statistics from UI: `UniversalToothValidator.calculateStatistics({ teeth })`
- Save via `PeriodontogramService.saveData(patientId, { teeth, statistics, versionName })`

## Load flow

- Load from `PeriodontogramService.getData`
- Transform backend → UI using `UniversalToothValidator.transformToFrontend(backendTooth, true)` to generate four-face shape for editing
- Maintain es/en mirroring in `handleToothUpdate` so UI reads what will be saved

## Contracts

- Save payload shape:
  {
    teeth: { [toothNumber]: UnifiedToothES },
    statistics: { bleedingPercentage, plaquePercentage, averageProbingDepth, ... },
    versionName: string
  }
- Versions are listed with `getDataVersions` and selected in the section header

## Notes

- The previous middleware `shared/middleware/periodontogram-transformation-middleware.js` is not used by Patient Detail and was removed.
- Legacy tests referencing deprecated paths were either removed or reduced to placeholders.
- Always prefer helpers for mapping to avoid drift between components and tests.
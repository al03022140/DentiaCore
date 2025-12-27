Odontogram module overview
 
Active components and services
- components/odontogram-initial-section.jsx: Renders the initial odontogram capture area or saved image in Patient Detail. Receives state and actions from Patient Detail.
- components/odontogram-clinical-section.jsx: Renders the clinical odontogram canvas and actions. Used by Patient Detail.
- api/odontograma-service.js: Service used dynamically from Patient Detail to save/delete/load initial and clinical odontogram state and images.
- utils/odontogram-utils.js: Utilities consumed by Patient Detail (e.g., prepareDataSource) and the components.

Removed/unused artifacts (clean-up)
- hooks/use-debounce.js: Not referenced anywhere in the workspace. Deleted.
- hooks/use-clinical-history.js: Not referenced anywhere. Deleted.
- hooks/tipo-value-fix.js: Not referenced; previous ad-hoc fix no longer needed. Deleted.
- api/desktop.ini: OS-generated file; removed.
- shared/utils/odontogram-normalizer.js: Not used by Patient Detail nor odontogram components/services. Removed to avoid drift. Re-introduce only if a shared normalization contract is adopted by multiple modules.

Notes
- Patient Detail orchestrates when to show initial image vs. canvas and interacts with the service using dynamic imports. If adding new features, keep Patient Detail as the single source of truth for routing state and service calls.
- Keep UI styles under Patient Detail styles; odontogram components are presentation-only and should not introduce global CSS.
import { useState, useCallback, memo } from 'react';

/**
 * Input numérico para gingivalMargin y probingDepth.
 *
 * Mantiene el estado de edición ("estoy escribiendo") en estado local en lugar
 * de elevarlo al padre. Esto evita que cada keystroke re-renderice las ~192
 * celdas del periodontograma.
 *
 * El padre sigue siendo el dueño del valor confirmado (vía onCommit), y de la
 * navegación con teclado / hover / focus programático (vía callbacks).
 */
const MeasurementInput = memo(function MeasurementInput({
  value,
  inputKey,
  toothNumber,
  rowKey,
  side,
  faceKey,
  index,
  min,
  max,
  disabled,
  onCommit,
  onAutoAdvance,
  cancelAutoAdvance,
  shouldAutoAdvanceImmediately,
  registerRef,
  programmaticFocusRef,
  focusSibling,
  addHoverEffect,
  removeHoverEffect,
  enableHoverEffects,
}) {
  const [localValue, setLocalValue] = useState(null);

  const isEditing = localValue !== null;
  let displayValue;
  if (isEditing) {
    displayValue = localValue;
  } else if (value !== undefined && value !== null) {
    displayValue = value.toString();
  } else {
    // Sin dato → '0'. Aplica a profundidad de sondaje y margen gingival:
    // mantener consistencia visual con MiniInputCell (anchura encía) y evitar
    // celdas en blanco cuando el diente nunca tuvo medición.
    displayValue = '0';
  }

  const handleFocus = useCallback((e) => {
    cancelAutoAdvance?.(inputKey);
    const isProgrammatic = programmaticFocusRef?.current === inputKey;
    const numericValue = Number(value);
    const shouldAutoSelect =
      isProgrammatic || (!isEditing && (!Number.isFinite(numericValue) || numericValue === 0));

    if (shouldAutoSelect) {
      requestAnimationFrame(() => {
        if (e.target && typeof e.target.select === 'function') {
          e.target.select();
        }
        if (isProgrammatic && programmaticFocusRef?.current === inputKey) {
          programmaticFocusRef.current = null;
        }
      });
    } else if (isProgrammatic && programmaticFocusRef?.current === inputKey) {
      programmaticFocusRef.current = null;
    }

    if (enableHoverEffects && addHoverEffect) {
      addHoverEffect(toothNumber, index);
    }
  }, [
    inputKey,
    value,
    isEditing,
    addHoverEffect,
    enableHoverEffects,
    toothNumber,
    index,
    cancelAutoAdvance,
    programmaticFocusRef,
  ]);

  const handleChange = useCallback((e) => {
    const inputValue = e.target.value;
    setLocalValue(inputValue);

    if (inputValue === '') {
      // Borrado completo: commitear 0 ya, no esperar al blur. Así, si el
      // usuario hace clic en Guardar inmediatamente, se persiste el 0.
      cancelAutoAdvance?.(inputKey);
      onCommit?.(0);
      return;
    }
    if (inputValue === '-' || inputValue === '+') {
      // Estado intermedio de signo (rango -9..9): aún no commit.
      cancelAutoAdvance?.(inputKey);
      return;
    }
    const numValue = Number(inputValue);
    if (!Number.isFinite(numValue)) {
      cancelAutoAdvance?.(inputKey);
      return;
    }
    onCommit?.(numValue);

    if (onAutoAdvance) {
      const advanceImmediately = shouldAutoAdvanceImmediately?.(rowKey, inputValue);
      onAutoAdvance(inputKey, {
        toothNumber,
        rowKey,
        side,
        faceKey,
        index,
      }, { delay: advanceImmediately ? 0 : 220 });
    }
  }, [
    inputKey,
    onCommit,
    onAutoAdvance,
    cancelAutoAdvance,
    shouldAutoAdvanceImmediately,
    rowKey,
    side,
    faceKey,
    toothNumber,
    index,
  ]);

  const handleBlur = useCallback((e) => {
    const inputValue = e.target.value.trim();
    cancelAutoAdvance?.(inputKey);

    if (inputValue === '') {
      onCommit?.(0);
    } else {
      const numValue = Number(inputValue);
      if (Number.isFinite(numValue)) {
        onCommit?.(numValue);
      }
    }

    setLocalValue(null);

    if (enableHoverEffects && removeHoverEffect) {
      removeHoverEffect(toothNumber, index);
    }
  }, [
    inputKey,
    onCommit,
    cancelAutoAdvance,
    enableHoverEffects,
    removeHoverEffect,
    toothNumber,
    index,
  ]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowRight' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      focusSibling?.(toothNumber, rowKey, side, faceKey, index, 1);
      return;
    }
    if (e.key === 'ArrowLeft' && !e.shiftKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      focusSibling?.(toothNumber, rowKey, side, faceKey, index, -1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!focusSibling?.(toothNumber, rowKey, side, faceKey, index, 1)) {
        e.currentTarget.blur();
      }
      return;
    }
    if (e.key === 'Backspace' && !e.shiftKey && !e.altKey && !e.metaKey) {
      const { selectionStart, selectionEnd, value: currentValue } = e.currentTarget;
      const cursorAtStart = selectionStart === 0 && selectionEnd === 0;
      const isEmpty = !currentValue || currentValue.length === 0;
      if (cursorAtStart || isEmpty) {
        if (focusSibling?.(toothNumber, rowKey, side, faceKey, index, -1)) {
          e.preventDefault();
        }
      }
    }
  }, [focusSibling, toothNumber, rowKey, side, faceKey, index]);

  const refCallback = useCallback((node) => {
    registerRef?.(inputKey, node);
  }, [registerRef, inputKey]);

  return (
    <input
      ref={refCallback}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={displayValue}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className="mini-input"
    />
  );
});

export default MeasurementInput;

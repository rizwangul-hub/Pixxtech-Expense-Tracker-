import { useEffect, useRef } from 'react';

/**
 * Global registry for tracking unsaved form changes across components
 */
const dirtyFormsMap = new Map();

export const registerDirtyForm = (formId, checkFn, label = 'Form') => {
  dirtyFormsMap.set(formId, { checkFn, label });
};

export const unregisterDirtyForm = (formId) => {
  dirtyFormsMap.delete(formId);
};

export const getUnsavedChangesStatus = () => {
  const dirtyLabels = [];
  for (const [id, item] of dirtyFormsMap.entries()) {
    try {
      const isDirty = typeof item.checkFn === 'function' ? item.checkFn() : Boolean(item.checkFn);
      if (isDirty) {
        dirtyLabels.push(item.label || id);
      }
    } catch (e) {
      console.warn('[UnsavedGuard Error]', e);
    }
  }
  return {
    hasUnsaved: dirtyLabels.length > 0,
    dirtyForms: dirtyLabels,
  };
};

/**
 * React hook to register a form's unsaved status and enable beforeunload warning
 */
export const useUnsavedGuard = (formId, isDirty, formLabel = 'Form') => {
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  useEffect(() => {
    registerDirtyForm(formId, () => isDirtyRef.current, formLabel);
    return () => {
      unregisterDirtyForm(formId);
    };
  }, [formId, formLabel]);

  // Window beforeunload browser prompt
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes that will be lost if you leave this page.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
};

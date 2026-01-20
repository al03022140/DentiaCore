export const hasPermission = (permissions = [], required = []) => {
  if (!required.length) return true;
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return required.some((perm) => permissions.includes(perm));
};

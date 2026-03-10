import React from 'react';
import { useAuth } from './AuthContext';
import { hasPermission } from './permissions';

const PermissionGate = ({ permissions = [], fallback = null, children }) => {
  const { user } = useAuth();
  const userPermissions = user?.permissions || [];

  if (!hasPermission(userPermissions, permissions)) {
    return fallback;
  }

  return <>{children}</>;
};

export default PermissionGate;

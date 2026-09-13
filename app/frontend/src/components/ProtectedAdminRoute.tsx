import { useLanguage } from '@/contexts/LanguageContext';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, User, LogIn } from 'lucide-react';

interface ProtectedAdminRouteProps {
  children: React.ReactNode;
}

const ProtectedAdminRoute: React.FC<ProtectedAdminRouteProps> = ({
  children,
}) => {
  const { t: coverageT } = useLanguage();
  const { user, loading, isAdmin, login } = useAuth();
  const location = useLocation();
  const roleKeys: Record<string, string> = {"user":"public.coverage.role.user","admin":"public.coverage.role.admin","superadmin":"public.coverage.role.superadmin","moderator":"public.coverage.role.moderator","master":"public.coverage.role.master","driver":"public.coverage.role.driver","courier":"public.coverage.role.courier","seller":"public.coverage.role.seller"};

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{coverageT("public.coverage.verifying")}</p>
        </div>
      </div>
    );
  }

  // If the user is not logged in, redirect to the login page
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If the user is not an admin, show an insufficient-permissions page
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <CardTitle className="text-xl text-gray-900">
              {coverageT("public.coverage.denied")}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-gray-600">
              <p className="mb-2">
                {coverageT("public.coverage.deniedBody")}</p>
              <div className="bg-gray-100 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-center space-x-2 text-sm">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-700">
                    {coverageT("public.coverage.currentAccount")} {user.email}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {coverageT("public.coverage.roleCaption")} {roleKeys[user.role] ? coverageT(roleKeys[user.role]) : user.role}
                </div>
              </div>
              <p className="text-sm">
                {coverageT("public.coverage.loginAdmin")}</p>
            </div>

            <div className="space-y-3">
              <Button onClick={login} className="w-full" variant="outline">
                <LogIn className="h-4 w-4 mr-2" />
                {coverageT("public.coverage.switchAccount")}</Button>

              <Button
                onClick={() => window.history.back()}
                className="w-full"
                variant="ghost"
              >
                {coverageT("public.coverage.back")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If the user is an admin, render the child components
  return <>{children}</>;
};

export default ProtectedAdminRoute;

import { Loader2Icon, ShieldOffIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Dashboard } from '@/components/dashboard';
import { LoginPage } from '@/components/login-page';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';

type Session =
  | { state: 'checking' }
  | { state: 'disabled' }
  | { state: 'anonymous'; notice: string | null }
  | { state: 'authenticated'; username: string };

export function App() {
  const [session, setSession] = useState<Session>({ state: 'checking' });

  useEffect(() => {
    api
      .session()
      .then(({ username }) => setSession({ state: 'authenticated', username }))
      .catch((error: unknown) =>
        setSession(
          error instanceof ApiError && error.status === 404
            ? { state: 'disabled' }
            : { state: 'anonymous', notice: null },
        ),
      );
  }, []);

  const handleSessionEnded = useCallback(
    (notice: string | null) => setSession({ state: 'anonymous', notice }),
    [],
  );

  switch (session.state) {
    case 'checking':
      return (
        <div className="flex min-h-svh items-center justify-center bg-muted/60">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      );
    case 'disabled':
      return (
        <main className="flex min-h-svh items-center justify-center bg-muted/60 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="justify-items-center text-center">
              <ShieldOffIcon className="mb-2 size-8 text-muted-foreground" />
              <CardTitle>Trang quản trị đang tắt</CardTitle>
              <CardDescription>
                Đặt EXPORT_USERNAME và EXPORT_PASSWORD trong .env rồi khởi động
                lại bot.
              </CardDescription>
            </CardHeader>
          </Card>
        </main>
      );
    case 'anonymous':
      return (
        <LoginPage
          notice={session.notice}
          onLoggedIn={(username) =>
            setSession({ state: 'authenticated', username })
          }
        />
      );
    case 'authenticated':
      return (
        <Dashboard
          username={session.username}
          onSessionEnded={handleSessionEnded}
        />
      );
  }
}

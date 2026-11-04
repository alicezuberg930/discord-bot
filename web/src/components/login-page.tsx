import {
  CircleAlertIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

export function LoginPage({
  notice,
  onLoggedIn,
}: {
  notice: string | null;
  onLoggedIn: (username: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const session = await api.login(username.trim(), password);
      onLoggedIn(session.username);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Không kết nối được máy chủ, vui lòng thử lại.',
      );
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }

  const message = error ?? notice;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/60 p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheckIcon className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Xác Thực Game
          </span>
        </div>

        <Card className="gap-5">
          <CardHeader className="text-center">
            <CardTitle className="text-xl tracking-tight">
              Đăng nhập quản trị
            </CardTitle>
            <CardDescription>
              Xem thành viên Discord và tải file Excel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={handleSubmit}>
              {message && (
                <Alert variant={error ? 'destructive' : 'warning'}>
                  <CircleAlertIcon />
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2">
                <Label htmlFor="username">Tên đăng nhập</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    className="pr-10"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground hover:bg-transparent"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={submitting || !username || !password}
              >
                {submitting && <Loader2Icon className="animate-spin" />}
                {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Chỉ dành cho quản trị viên. Đăng nhập sai 10 lần sẽ bị khoá 15 phút.
        </p>
      </div>
    </main>
  );
}

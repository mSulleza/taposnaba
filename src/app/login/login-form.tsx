"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  return (
    <Card>
      <CardBody className="p-5">
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" required />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.error && <Alert tone="danger">Mali ang email o password. / Wrong email or password.</Alert>}
          <Button type="submit" size="lg" block loading={pending}>
            Mag-sign in · Sign in
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

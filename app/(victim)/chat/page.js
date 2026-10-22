import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata = {
  title: "Victim Chat | Justra",
};

export default function VictimChatPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
      <Card>
        <CardHeader className="border-b">
          <Badge variant="outline" className="w-fit">Double-blind Messaging</Badge>
          <CardTitle className="mt-3">Case Chat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            Messages here are linked to your case token only. No personal identity is exposed.
          </div>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="font-medium">HR Admin</p>
            <p className="mt-2 text-muted-foreground">We have started reviewing your complaint.</p>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Type your message..." />
            <Button>Send</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

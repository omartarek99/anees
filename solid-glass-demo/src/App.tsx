import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { StatusGlyph } from '@/components/ui/status-glyph'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function App() {
  const [dark, setDark] = useState(true)
  document.documentElement.classList.toggle('dark', dark)

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Solid Glass demo</h1>
        <label className="flex items-center gap-2 text-sm">
          Dark <Switch checked={dark} onCheckedChange={setDark} />
        </label>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Sandworm Sentinel</CardTitle>
          <CardDescription>Level 5 boss, Desert Oasis</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Math</Badge>
            <Badge variant="secondary">Science</Badge>
            <Badge variant="outline">5 of 6 to win</Badge>
            <StatusGlyph activity="thinking" />
          </div>
          <Input placeholder="Type your answer" />
          <div className="flex flex-wrap gap-2">
            <Button>Enter the Cistern</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Dialog>
              <DialogTrigger render={<Button variant="outline">Open dialog</Button>} />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Penitent's Rite</DialogTitle>
                  <DialogDescription>Controls are shown before the fight starts.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="friends">
        <TabsList>
          <TabsTrigger value="friends">My Friends</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="suggested">Suggested</TabsTrigger>
        </TabsList>
        <TabsContent value="friends">Friends list goes here.</TabsContent>
        <TabsContent value="requests">No requests.</TabsContent>
        <TabsContent value="suggested">Top players this month.</TabsContent>
      </Tabs>
    </main>
  )
}

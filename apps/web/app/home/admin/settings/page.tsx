'use client';

import { useEffect, useState } from 'react';

import { PageBody } from '@kit/ui/page';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Badge } from '@kit/ui/badge';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [config, setConfig] = useState({
    deployment_mode: 'local',
    local_url: 'http://127.0.0.1:11434',
    local_model: 'llama3:latest',
    cloud_key: '',
    cloud_model: 'gpt-4o',
  });

  useEffect(() => {
    fetch('/api/admin/llm-config')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setConfig({
            deployment_mode: data.deployment_mode || 'local',
            local_url: data.local_url || 'http://127.0.0.1:11434',
            local_model: data.local_model || 'llama3:latest',
            cloud_key: data.cloud_key || '',
            cloud_model: data.cloud_model || 'gpt-4o',
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        alert('Configuration sauvegardée avec succès !');
      } else {
        alert('Erreur lors de la sauvegarde : ' + data.error);
      }
    } catch (e: any) {
      alert('Erreur: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/llm-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: `Connecté ! Réponse du modèle: "${data.message}"` });
      } else {
        setTestResult({ success: false, message: data.error || 'Erreur de connexion' });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <PageBody>Chargement des paramètres...</PageBody>;
  }

  return (
    <PageBody>
      <div className="flex flex-col gap-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configuration LLM</h1>
          <p className="text-muted-foreground">
            Basculez dynamiquement entre le modèle local (Ollama) et le cloud (OpenAI).
          </p>
        </div>

        <Tabs 
          value={config.deployment_mode} 
          onValueChange={(val) => setConfig({ ...config, deployment_mode: val })}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="local">Mode Local (Ollama)</TabsTrigger>
            <TabsTrigger value="cloud">Mode Cloud (OpenAI)</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Ollama API URL</Label>
              <Input
                value={config.local_url}
                onChange={(e) => setConfig({ ...config, local_url: e.target.value })}
                placeholder="http://127.0.0.1:11434"
              />
            </div>
            <div className="space-y-2">
              <Label>Nom du modèle (ex: llama3:latest)</Label>
              <Input
                value={config.local_model}
                onChange={(e) => setConfig({ ...config, local_model: e.target.value })}
                placeholder="llama3:latest"
              />
            </div>
          </TabsContent>

          <TabsContent value="cloud" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>OpenAI API Key</Label>
              <Input
                type="password"
                value={config.cloud_key}
                onChange={(e) => setConfig({ ...config, cloud_key: e.target.value })}
                placeholder="sk-..."
              />
              <p className="text-xs text-muted-foreground">
                Si vide, le système tentera d'utiliser la clé définie dans le fichier .env.local
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nom du modèle (ex: gpt-4o)</Label>
              <Input
                value={config.cloud_model}
                onChange={(e) => setConfig({ ...config, cloud_model: e.target.value })}
                placeholder="gpt-4o"
              />
            </div>
          </TabsContent>
        </Tabs>

        {testResult && (
          <div className="mt-2">
            <Badge variant={testResult.success ? 'success' : 'destructive'} className="mr-2">
              {testResult.success ? 'Succès' : 'Erreur'}
            </Badge>
            <span className="text-sm">{testResult.message}</span>
          </div>
        )}

        <div className="flex gap-4 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleTest} disabled={testing || saving}>
            {testing ? 'Test en cours...' : 'Tester la connexion'}
          </Button>
          <Button onClick={handleSave} disabled={saving || testing}>
            {saving ? 'Enregistrement...' : 'Enregistrer la configuration'}
          </Button>
        </div>
      </div>
    </PageBody>
  );
}

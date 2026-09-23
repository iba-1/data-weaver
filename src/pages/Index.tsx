import { useState } from 'react';
import { ImportWizard, type ArtworkRecord, type ImportReport, type ImportWizardEvent } from '@/components/import-wizard';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { createDemoHostApp } from './demoHostApp';

const Index = () => {
  const { toast } = useToast();
  // One simulated collection for the page's lifetime: importing the same file twice rejects the repeats
  const [adapter] = useState(createDemoHostApp);
  // A new wizard for each import
  const [importRun, setImportRun] = useState(0);
  const [finished, setFinished] = useState(false);

  const handleImportFinished = (report: ImportReport<ArtworkRecord>) => {
    console.log('Import finished:', report);
    setFinished(true);
    toast({
      title: 'Import finished',
      description: `${report.created.length} imported, ${report.rejected.length} rejected, ${report.excluded.length} excluded.`,
    });
  };

  const handleEvent = (event: ImportWizardEvent) => {
    console.log('Wizard event:', event);

    if (event.type === 'ERROR') {
      toast({
        title: 'Error',
        description: event.error,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Artwork Data Importer
          </h1>
          <p className="text-muted-foreground">
            Import artwork data from CSV or Excel files
          </p>
        </header>

        <ImportWizard
          key={importRun}
          adapter={adapter}
          onImportFinished={handleImportFinished}
          onEvent={handleEvent}
          requiredFields={['title', 'artist']}
        />

        {finished && (
          <div className="mt-6 text-center">
            <Button
              variant="outline"
              onClick={() => {
                setFinished(false);
                setImportRun((run) => run + 1);
              }}
            >
              Import another file
            </Button>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
};

export default Index;

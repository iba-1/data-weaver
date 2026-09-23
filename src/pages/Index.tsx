import { ImportWizard, type ArtworkRecord, type ImportWizardEvent } from '@/components/import-wizard';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const { toast } = useToast();

  const handleComplete = (data: ArtworkRecord[]) => {
    console.log('Import completed with data:', data);
    toast({
      title: 'Import Successful',
      description: `Successfully imported ${data.length} artwork records.`,
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
          onComplete={handleComplete}
          onEvent={handleEvent}
          requiredFields={['title', 'artist']}
        />
      </div>
      <Toaster />
    </div>
  );
};

export default Index;

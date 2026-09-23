import { Download } from 'lucide-react';
import { rejectedRowsFormat, rejectedRowsSheet, sheetToBlob } from '@/lib/import-wizard/exporter';
import type { RejectedRowsSheetInput } from '@/lib/import-wizard/exporter';
import type { ParsedFileData } from '@/lib/import-wizard/types';
import { Button } from '@/components/ui/button';
import { useMessages } from '../messages';

interface RejectedRowsDownloadProps<TRecord>
  extends Omit<RejectedRowsSheetInput<TRecord>, 'file' | 'messages'> {
  /** The uploaded file */
  file: Pick<ParsedFileData, 'headers' | 'rows' | 'fileName'>;
  /** What the upload step accepts: the download is in one of these formats, to be imported again */
  acceptedFileTypes: string[];
}

/** Hand a file to the browser to download */
function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Released once the browser has started the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The Import Report's download of the Rejected Rows: a spreadsheet of the
 * file's own columns plus an error column, to fix and import again
 */
export function RejectedRowsDownload<TRecord>({ file, acceptedFileTypes, ...input }: RejectedRowsDownloadProps<TRecord>) {
  const m = useMessages();

  const handleDownload = () => {
    const format = rejectedRowsFormat(acceptedFileTypes);
    const sheet = rejectedRowsSheet({ ...input, file, messages: m });
    const fileName = m.report.downloadFileName({ fileName: file.fileName.replace(/\.[^.]*$/, '') });
    download(sheetToBlob(sheet, { sheetName: m.report.downloadSheetName(), format }), `${fileName}.${format}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="min-w-0 flex-1 text-sm text-foreground">{m.report.downloadHint()}</p>
      <Button variant="outline" className="gap-2" onClick={handleDownload}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {m.report.download()}
      </Button>
    </div>
  );
}

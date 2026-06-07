import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useToast } from './Toast';

interface ExportFormButtonsProps {
  form: any;
  userName?: string;
  compact?: boolean; // for FormList compact mode
}

export default function ExportFormButtons({
  form,
  userName,
  compact = false,
}: ExportFormButtonsProps) {
  const showToast = useToast();
  const exportingRef = useRef(false);
  const [loadingExcel, setLoadingExcel] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const isLoading = loadingExcel || loadingPdf;

  const handleExportExcel = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setLoadingExcel(true);
    try {
      const { exportToExcel } = await import('../utils/exportFormExcel');
      await exportToExcel(form);
      showToast('הקובץ הורד בהצלחה');
    } catch (err) {
      console.error('Excel export failed:', err);
      showToast('שגיאה בהכנת קובץ האקסל');
    } finally {
      exportingRef.current = false;
      setLoadingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setLoadingPdf(true);
    try {
      const { exportToPdf } = await import('../utils/exportFormPdf');
      await exportToPdf(form, userName);
      showToast('הקובץ הורד בהצלחה');
    } catch (err) {
      console.error('PDF export failed:', err);
      showToast('שגיאה בהכנת קובץ ה-PDF');
    } finally {
      exportingRef.current = false;
      setLoadingPdf(false);
    }
  };

  const btnClass = compact
    ? 'btn-duo-flat btn-duo-sm flex items-center gap-1.5'
    : 'btn-duo btn-duo-ghost btn-duo-sm flex items-center gap-1.5';

  return (
    <div
      className={`flex gap-2 ${compact ? '' : 'justify-center flex-wrap'}`}
      dir="rtl"
    >
      <button
        onClick={handleExportExcel}
        disabled={isLoading}
        aria-disabled={isLoading}
        aria-label={loadingExcel ? 'מכין קובץ אקסל...' : 'הורד קובץ אקסל'}
        className={btnClass}
        style={{ minWidth: compact ? undefined : '110px' }}
      >
        {loadingExcel ? (
          <span
            className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Download size={14} aria-hidden="true" />
        )}
        <span>{loadingExcel ? 'מכין...' : 'Excel'}</span>
      </button>

      <button
        onClick={handleExportPdf}
        disabled={isLoading}
        aria-disabled={isLoading}
        aria-label={loadingPdf ? 'מכין קובץ PDF...' : 'הורד קובץ PDF'}
        className={btnClass}
        style={{ minWidth: compact ? undefined : '110px' }}
      >
        {loadingPdf ? (
          <span
            className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Download size={14} aria-hidden="true" />
        )}
        <span>{loadingPdf ? 'מכין...' : 'PDF'}</span>
      </button>
    </div>
  );
}

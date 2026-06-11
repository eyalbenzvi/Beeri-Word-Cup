import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import * as Sentry from '@sentry/react';
import { useToast } from './Toast';

interface ExportFormButtonsProps {
  form: any;
  compact?: boolean;
}

export default function ExportFormButtons({
  form,
  compact = false,
}: ExportFormButtonsProps) {
  const showToast = useToast();
  const exportingRef = useRef(false);
  const [loadingExcel, setLoadingExcel] = useState(false);

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
      Sentry.captureException(err);
      showToast('שגיאה בהכנת קובץ האקסל');
    } finally {
      exportingRef.current = false;
      setLoadingExcel(false);
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
        disabled={loadingExcel}
        aria-disabled={loadingExcel}
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
    </div>
  );
}

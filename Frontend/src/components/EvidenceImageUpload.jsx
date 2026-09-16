import React from 'react';
import { ImagePlus, X } from 'lucide-react';

export function EvidenceImageUpload({ files, onChange, disabled = false }) {
  const handleChange = (event) => {
    const selected = Array.from(event.target.files || []);
    onChange([...files, ...selected].slice(0, 10));
    event.target.value = '';
  };

  const removeFile = (index) => {
    onChange(files.filter((_, fileIndex) => fileIndex !== index));
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-bold uppercase text-slate-700 mb-1">
        <ImagePlus size={16} className="text-blue-600" /> Purchase / Receipt Images
      </label>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={handleChange}
        disabled={disabled || files.length >= 10}
        className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700 disabled:opacity-50"
      />
      <p className="mt-1 text-[11px] text-slate-500">Upload up to 10 images, maximum 10 MB each.</p>
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span key={`${file.name}-${file.lastModified}-${index}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800">
              <span className="max-w-[180px] truncate">{file.name}</span>
              <button type="button" onClick={() => removeFile(index)} disabled={disabled} aria-label={`Remove ${file.name}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default EvidenceImageUpload;

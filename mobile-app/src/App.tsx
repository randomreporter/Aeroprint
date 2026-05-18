import { useEffect, useState } from 'react';
import { socket, BACKEND_URL } from './socket';
import { UploadCloud, CheckCircle, Printer, FileText, Settings, X, Loader2, LayoutTemplate, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './index.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Step = 'CONNECTING' | 'UPLOAD' | 'OPTIONS' | 'PRINTING' | 'SUCCESS' | 'ERROR';

export type PrintFile = {
  id: string;
  file: File;
  fileUrl: string;
  settings: {
    colorMode: 'bw' | 'color';
    orientation: 'portrait' | 'landscape';
    copies: number;
    numPages: number;
    pageRange: string;
    originalNumPages: number;
    selectedPagesCount: number;
  };
};

function parsePageRange(rangeStr: string, maxPages: number): number {
  if (!rangeStr || rangeStr.trim() === '' || rangeStr.trim().toLowerCase() === 'all') {
    return maxPages;
  }

  const pages = new Set<number>();
  const parts = rangeStr.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      
      if (isNaN(start) || isNaN(end) || start > end || start < 1 || end > maxPages) {
        return -1;
      }
      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      const page = parseInt(trimmed);
      if (isNaN(page) || page < 1 || page > maxPages) {
        return -1;
      }
      pages.add(page);
    }
  }
  
  return pages.size;
}

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('CONNECTING');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [printFiles, setPrintFiles] = useState<PrintFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Preview State
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [showPreviewOnKiosk, setShowPreviewOnKiosk] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const session = params.get('session');
    
    if (!session) {
      setStep('ERROR');
      setErrorMsg('Invalid QR Code. Please scan the kiosk screen again.');
      return;
    }
    setSessionId(session);

    if (socket.connected) {
      socket.emit('mobile:join_session', { sessionId: session });
    }
    socket.on('connect', () => socket.emit('mobile:join_session', { sessionId: session }));
    socket.on('mobile:joined', (res: any) => {
      if (res.success) setStep('UPLOAD');
      else { setStep('ERROR'); setErrorMsg(res.error || 'Failed to connect'); }
    });
    socket.on('session:terminated', () => setStep('SUCCESS'));

    return () => {
      socket.off('connect');
      socket.off('mobile:joined');
      socket.off('session:terminated');
    };
  }, []);

  // Sync preview to kiosk whenever state changes
  useEffect(() => {
    if (!sessionId || printFiles.length === 0) return;
    const activeFile = printFiles[activeIndex];
    socket.emit('mobile:sync_preview', {
      sessionId,
      showPreview: showPreviewOnKiosk,
      fileUrl: activeFile.fileUrl,
      pageNumber,
      orientation: activeFile.settings.orientation
    });
  }, [showPreviewOnKiosk, activeIndex, pageNumber, printFiles, sessionId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;
    if (selectedFiles.length > 5) {
      alert('You can only upload a maximum of 5 files.');
      return;
    }
    
    setIsUploading(true);
    const uploadedFiles: PrintFile[] = [];

    for (const file of selectedFiles) {
      let numPages = 1; // Default for non-PDFs or failed parse
      
      if (file.type === 'application/pdf') {
        try {
           const arrayBuffer = await file.arrayBuffer();
           const pdf = await pdfjs.getDocument(arrayBuffer).promise;
           numPages = pdf.numPages;
        } catch (e) {
           console.error("Failed to parse PDF pages", e);
        }
      }

      const formData = new FormData();
      formData.append('document', file);
      formData.append('sessionId', sessionId!);

      try {
        const response = await fetch(`${BACKEND_URL}/api/upload`, {
          method: 'POST',
          headers: { 'ngrok-skip-browser-warning': 'true' },
          body: formData,
        });
        const data = await response.json();
        if (data.success) {
          uploadedFiles.push({
            id: Math.random().toString(36).substring(7),
            file: file,
            fileUrl: data.fileUrl,
            settings: { 
              colorMode: 'bw', 
              orientation: 'portrait', 
              copies: 1, 
              numPages,
              pageRange: '',
              originalNumPages: numPages,
              selectedPagesCount: numPages
            }
          });
        }
      } catch (error) {
        console.error('Upload error for file:', file.name);
      }
    }

    setIsUploading(false);
    if (uploadedFiles.length > 0) {
      setPrintFiles(uploadedFiles);
      setActiveIndex(0);
      setPageNumber(1);
      setStep('OPTIONS');
    } else {
      alert('Upload failed. Please try again.');
    }
  };

  const updateActiveFileSettings = (settingsUpdate: Partial<PrintFile['settings']>) => {
    setPrintFiles(prev => {
      const newFiles = [...prev];
      const activeFile = newFiles[activeIndex];
      let newSettings = { ...activeFile.settings, ...settingsUpdate };
      
      if ('pageRange' in settingsUpdate) {
        const count = parsePageRange(settingsUpdate.pageRange || '', newSettings.originalNumPages);
        if (count !== -1) {
          newSettings.selectedPagesCount = count;
          newSettings.numPages = count;
        } else {
          newSettings.selectedPagesCount = -1;
        }
      }

      newFiles[activeIndex] = {
        ...activeFile,
        settings: newSettings
      };
      return newFiles;
    });
  };

  const applySettingsToAll = () => {
    setPrintFiles(prev => prev.map(f => {
       const newSettings = { ...activeFile.settings };
       const count = parsePageRange(newSettings.pageRange, f.settings.originalNumPages);
       newSettings.originalNumPages = f.settings.originalNumPages;
       newSettings.selectedPagesCount = count;
       newSettings.numPages = count === -1 ? f.settings.originalNumPages : count;
       
       return { ...f, settings: newSettings };
    }));
    alert('Settings applied to all files!');
  };

  const handlePrint = async () => {
    if (printFiles.length === 0) return;
    
    let totalSelectedPagesPreview = 0;
    for (const f of printFiles) {
      if (f.settings.selectedPagesCount === -1) {
        alert(`Invalid page range for file: ${f.file.name}`);
        return;
      }
      totalSelectedPagesPreview += (f.settings.selectedPagesCount * f.settings.copies);
    }
    
    if (totalSelectedPagesPreview > 15) {
      alert(`You have selected ${totalSelectedPagesPreview} total pages. The maximum allowed per order is 15.`);
      return;
    }
    
    socket.emit('mobile:payment_started', { sessionId });
    
    try {
      // 1. Create Order
      const res = await fetch(`${BACKEND_URL}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ files: printFiles.map(f => f.settings) })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error('Order creation failed');

      // 2. Razorpay Checkout
      const options = {
        key: data.key,
        amount: data.amount,
        currency: "INR",
        name: "NexusPrint",
        description: `Printing ${printFiles.length} Document(s)`,
        order_id: data.orderId,
        handler: function () {
          setStep('PRINTING');
          const payloadFiles = printFiles.map(f => ({ fileUrl: f.fileUrl, settings: f.settings }));
          socket.emit('mobile:trigger_print', { sessionId, files: payloadFiles });
        },
        prefill: { name: "Test User", email: "test@example.com", contact: "9999999999" },
        theme: { color: "#4f46e5" },
        modal: {
          ondismiss: function() {
            socket.emit('mobile:payment_failed', { sessionId });
          }
        }
      };

      // @ts-ignore
      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', function (response: any) {
         socket.emit('mobile:payment_failed', { sessionId });
         alert("Payment failed: " + response.error.description);
      });
      rzp1.open();

    } catch (err) {
      console.error(err);
      socket.emit('mobile:payment_failed', { sessionId });
      alert("Could not initialize payment.");
    }
  };

  let totalPrice = 0;
  let totalSelectedPagesPreview = 0;
  let hasInvalidRange = false;
  
  for (const f of printFiles) {
    if (f.settings.selectedPagesCount === -1) {
      hasInvalidRange = true;
    } else {
      const pricePerSheet = f.settings.colorMode === 'color' ? 15 : 5;
      totalPrice += (pricePerSheet * f.settings.selectedPagesCount * f.settings.copies);
      totalSelectedPagesPreview += (f.settings.selectedPagesCount * f.settings.copies);
    }
  }

  const activeFile = printFiles[activeIndex];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Printer size={18} className="text-white" />
          </div>
          <h1 className="font-bold text-xl text-slate-800 tracking-tight">Aero</h1>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col max-w-lg mx-auto w-full">
        {step === 'CONNECTING' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <Loader2 className="animate-spin text-emerald-600" size={32} />
            <h2 className="text-2xl font-bold">Connecting...</h2>
          </div>
        )}

        {step === 'ERROR' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <X className="text-red-500" size={40} />
            <h2 className="text-2xl font-bold">Connection Failed</h2>
            <p>{errorMsg}</p>
          </div>
        )}

        {step === 'UPLOAD' && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8">
              <h2 className="text-3xl font-bold">Upload Files</h2>
              <p className="text-slate-500 mt-2">Select up to 5 documents to print.</p>
            </div>
            
            <label className="flex-1 border-2 border-dashed border-emerald-200 bg-white rounded-[2rem] flex flex-col items-center justify-center p-8 cursor-pointer relative overflow-hidden">
              <input type="file" multiple accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              {isUploading ? (
                <div className="flex flex-col items-center">
                  <Loader2 className="animate-spin text-emerald-600 mb-6" size={56} />
                  <span className="font-bold text-emerald-900 text-xl">Uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud className="text-emerald-600 mb-4" size={48} />
                  <span className="font-bold text-slate-800 text-xl">Tap to Browse</span>
                </div>
              )}
            </label>
          </div>
        )}

        {step === 'OPTIONS' && activeFile && (
          <div className="flex-1 flex flex-col pb-24">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold tracking-tight text-slate-800">Print Settings</h2>
              {printFiles.length > 1 && (
                <button onClick={applySettingsToAll} className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full active:scale-95 transition-all">
                  Apply to All
                </button>
              )}
            </div>
            
            {/* Multi-file Carousel */}
            {printFiles.length > 1 && (
              <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm mb-6 border border-slate-100">
                <button onClick={() => { setActiveIndex(Math.max(0, activeIndex - 1)); setPageNumber(1); }} disabled={activeIndex === 0} className="p-2 disabled:opacity-30">
                  <ChevronLeft />
                </button>
                <div className="text-center font-bold text-slate-800 flex-1 truncate px-2">
                  <span className="text-xs text-slate-400 block uppercase tracking-wider mb-1">File {activeIndex + 1} of {printFiles.length}</span>
                  {activeFile.file.name}
                </div>
                <button onClick={() => { setActiveIndex(Math.min(printFiles.length - 1, activeIndex + 1)); setPageNumber(1); }} disabled={activeIndex === printFiles.length - 1} className="p-2 disabled:opacity-30">
                  <ChevronRight />
                </button>
              </div>
            )}

            {/* Document Preview & Pagination */}
            <div className="bg-slate-200 rounded-[1.5rem] p-4 flex flex-col justify-center items-center overflow-hidden mb-4 shadow-inner border border-slate-300 relative" style={{ minHeight: '280px' }}>
               {activeFile.file.type === 'application/pdf' ? (
                 <>
                   <div className={`transition-transform duration-500 origin-center ${activeFile.settings.orientation === 'landscape' ? '-rotate-90 scale-90' : 'rotate-0 scale-100'}`}>
                     <Document file={activeFile.file} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                       <Page pageNumber={pageNumber} width={180} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-lg rounded-md overflow-hidden" />
                     </Document>
                   </div>
                   
                   {/* PDF Pagination Controls */}
                   {numPages && numPages > 1 && (
                     <div className="absolute bottom-3 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-sm flex items-center gap-4 border border-slate-200 z-10">
                       <button onClick={() => setPageNumber(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1} className="disabled:opacity-30 p-1"><ChevronLeft size={18}/></button>
                       <span className="text-xs font-bold font-mono">{pageNumber} / {numPages}</span>
                       <button onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))} disabled={pageNumber >= numPages} className="disabled:opacity-30 p-1"><ChevronRight size={18}/></button>
                     </div>
                   )}
                 </>
               ) : (
                 <div className="flex flex-col items-center text-slate-500 gap-2">
                    <FileText size={48} className="opacity-50" />
                    <p className="text-sm font-medium">Preview only available for PDF</p>
                 </div>
               )}
            </div>

            {/* Privacy Toggle */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between mb-8 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                  <Eye size={20} />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">Project to Kiosk Screen</p>
                  <p className="text-xs text-slate-500">Show preview on the large screen</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={showPreviewOnKiosk} onChange={(e) => setShowPreviewOnKiosk(e.target.checked)} />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="space-y-6">
              {/* Pages to Print */}
              <div>
                <label className="font-bold text-slate-800 flex items-center gap-2 mb-3"><FileText size={18} className="text-emerald-500" /> Pages to Print</label>
                <input 
                  type="text" 
                  value={activeFile.settings.pageRange} 
                  onChange={(e) => updateActiveFileSettings({ pageRange: e.target.value })}
                  placeholder={`e.g. 1-${activeFile.settings.originalNumPages}, or leave empty for All`}
                  className={`w-full p-3 rounded-xl border-2 outline-none transition-all ${activeFile.settings.selectedPagesCount === -1 ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 focus:border-emerald-500'}`}
                />
                <p className="text-xs text-slate-500 mt-2 font-medium">Leave empty for ALL pages, or type "1-3, 5"</p>
              </div>
              {/* Orientation */}
              <div>
                <label className="font-bold text-slate-800 flex items-center gap-2 mb-3"><LayoutTemplate size={18} className="text-emerald-500" /> Orientation</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => updateActiveFileSettings({ orientation: 'portrait' })} className={`p-3 rounded-xl font-bold border-2 transition-all ${activeFile.settings.orientation === 'portrait' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white'}`}>Portrait</button>
                  <button onClick={() => updateActiveFileSettings({ orientation: 'landscape' })} className={`p-3 rounded-xl font-bold border-2 transition-all ${activeFile.settings.orientation === 'landscape' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white'}`}>Landscape</button>
                </div>
              </div>
              {/* Color Mode */}
              <div>
                <label className="font-bold text-slate-800 flex items-center gap-2 mb-3"><Settings size={18} className="text-emerald-500" /> Color Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => updateActiveFileSettings({ colorMode: 'bw' })} className={`p-3 rounded-xl font-bold border-2 transition-all ${activeFile.settings.colorMode === 'bw' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white'}`}>B & W</button>
                  <button onClick={() => updateActiveFileSettings({ colorMode: 'color' })} className={`p-3 rounded-xl font-bold border-2 transition-all ${activeFile.settings.colorMode === 'color' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white'}`}>Color</button>
                </div>
              </div>
              {/* Copies */}
              <div>
                <label className="font-bold text-slate-800 flex items-center gap-2 mb-3"><FileText size={18} className="text-emerald-500" /> Copies</label>
                <div className="flex items-center gap-4">
                  <button onClick={() => updateActiveFileSettings({ copies: Math.max(1, activeFile.settings.copies - 1) })} className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex justify-center items-center text-2xl font-bold">-</button>
                  <span className="flex-1 text-center font-black text-2xl">{activeFile.settings.copies}</span>
                  <button onClick={() => updateActiveFileSettings({ copies: activeFile.settings.copies + 1 })} className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex justify-center items-center text-2xl font-bold">+</button>
                </div>
              </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-50">
              <div className="max-w-lg mx-auto flex items-center justify-between mb-3 px-2">
                <span className="font-bold text-slate-500">Total Pages: <span className={totalSelectedPagesPreview > 15 ? "text-red-500" : "text-slate-800"}>{totalSelectedPagesPreview}/15</span></span>
                <span className="font-black text-xl text-emerald-600">₹{totalPrice}</span>
              </div>
              <button 
                onClick={handlePrint} 
                disabled={hasInvalidRange || totalSelectedPagesPreview > 15 || isUploading}
                className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 bg-slate-900 text-white p-4 rounded-2xl font-bold text-lg shadow-xl shadow-slate-900/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
              >
                <Printer size={22} /> Print All ({printFiles.length})
              </button>
            </div>
          </div>
        )}

        {step === 'PRINTING' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <Loader2 className="animate-spin text-emerald-600" size={48} />
            <h2 className="text-3xl font-bold">Printing...</h2>
            <p>Your documents are being spooled.</p>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
            <CheckCircle className="text-green-500" size={64} />
            <h2 className="text-3xl font-bold">Print Successful!</h2>
            <p className="text-slate-600 font-medium">Your documents have been processed.</p>
            
            <div className="mt-8 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl w-full text-left">
               <h3 className="font-bold text-emerald-900 text-lg mb-2">Session Ended</h3>
               <p className="text-sm text-emerald-700">For your security, you have been safely logged out. Scan the QR code on the kiosk screen to connect again.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

import path from 'path';
import fs from 'fs';
import os from 'os';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const uploadDir = path.join(__dirname, '../uploads');

function convertWordToPdf(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const absoluteInputPath = path.resolve(inputPath);
    const absoluteOutputPath = path.resolve(outputPath);
    const tempScriptPath = path.join(os.tmpdir(), `ap-convert-${uuidv4()}.ps1`);

    const psScriptContent = `
$ErrorActionPreference = 'Stop'
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open("${absoluteInputPath.replace(/"/g, '`"')}")
  $doc.SaveAs("${absoluteOutputPath.replace(/"/g, '`"')}", 17)
  $doc.Close()
  $word.Quit()
  Write-Output "SUCCESS"
} catch {
  if ($word) {
    try { $word.Quit() } catch {}
  }
  Write-Error $_.Exception.Message
  exit 1
}
`;

    fs.writeFileSync(tempScriptPath, psScriptContent, 'utf8');

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, (err, stdout, stderr) => {
      try {
        if (fs.existsSync(tempScriptPath)) {
          fs.unlinkSync(tempScriptPath);
        }
      } catch (unlinkErr) {
        console.error('[Converter] Failed to delete temp PS1 script:', unlinkErr);
      }

      if (err) {
        console.error('[Converter] Word to PDF failed:', err, stderr);
        reject(new Error(stderr || err.message));
      } else if (stdout.includes('SUCCESS') || fs.existsSync(absoluteOutputPath)) {
        console.log('[Converter] Word to PDF completed successfully.');
        resolve();
      } else {
        reject(new Error('Conversion finished but PDF was not created.'));
      }
    });
  });
}

async function test() {
  const inputWord = path.join(uploadDir, 'test.docx');
  const outputPdf = path.join(uploadDir, 'test_docx.pdf');

  console.log('Testing Word to PDF conversion with temp ps1 script...');
  try {
    if (fs.existsSync(outputPdf)) {
      fs.unlinkSync(outputPdf);
    }
    await convertWordToPdf(inputWord, outputPdf);
    console.log('PDF file exists:', fs.existsSync(outputPdf));
    if (fs.existsSync(outputPdf)) {
      const pdfBytes = fs.readFileSync(outputPdf);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      console.log('PDF Page Count:', pdfDoc.getPageCount());
    }
  } catch (err) {
    console.error('Word conversion test failed:', err);
  }
}

test();

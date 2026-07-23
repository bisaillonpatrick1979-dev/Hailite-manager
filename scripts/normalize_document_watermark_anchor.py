from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'components' / 'ClientDocumentsManager.tsx'
text = path.read_text(encoding='utf-8')

canvas_index = text.find('id="gcp-pdf-canvas"')
content_marker = '<div className="relative z-10 space-y-6">'
content_index = text.find(content_marker, canvas_index)

if canvas_index == -1 or content_index == -1:
    raise RuntimeError(f'Zone PDF introuvable: canvas={canvas_index}, contenu={content_index}')

absolute_index = text.rfind('<div className="absolute', canvas_index, content_index)
if absolute_index == -1:
    raise RuntimeError('Ancien filigrane absolu introuvable')

comment_index = text.rfind('{/*', canvas_index, absolute_index)
start_index = comment_index if comment_index != -1 else absolute_index

normalized = '''{/* Dynamic Logo Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
                <span>WATERMARK-ANCHOR</span>
              </div>

              {/* Real PDF Sheet Content structure */}
              '''

text = text[:start_index] + normalized + text[content_index:]
path.write_text(text, encoding='utf-8')
print('Bloc de filigrane documentaire normalisé.')

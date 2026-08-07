import { useLayoutEffect, useRef } from 'react';

/**
 * Garde une zone de saisie assez haute pour afficher son contenu, puis active
 * le défilement interne seulement lorsqu'elle atteint la hauteur maximale.
 * Les mises à jour programmatiques (notamment la dictée vocale) sont donc
 * redimensionnées de la même façon que le texte tapé au clavier.
 */
export function useAutoResizeTextarea(value: string, maxHeight: number) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const wasNearBottom = textarea.scrollHeight - textarea.scrollTop - textarea.clientHeight < 24;
    textarea.style.height = 'auto';

    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';

    // Pendant la dictée, le focus est sur le bouton du micro : faire suivre
    // automatiquement les derniers mots sans déranger une édition manuelle.
    if (document.activeElement !== textarea || wasNearBottom) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [maxHeight, value]);

  return ref;
}

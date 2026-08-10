import React from 'react';
import { publicSiteUrl } from '../runtimeConfig';

type Props = {
  language: 'FR' | 'EN';
  className?: string;
};

export default function LegalLinks({ language, className = '' }: Props) {
  const labels = language === 'FR'
    ? ['Confidentialité', 'Conditions', 'Supprimer un compte']
    : ['Privacy', 'Terms', 'Delete an account'];
  const links = ['/privacy.html', '/terms.html', '/account-deletion.html'];

  return (
    <nav aria-label={language === 'FR' ? 'Liens légaux' : 'Legal links'} className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] font-bold text-gray-400 ${className}`}>
      {links.map((href, index) => (
        <a
          key={href}
          href={publicSiteUrl(href)}
          target="_blank"
          rel="noreferrer"
          // min-h-11 : 44 px, le minimum utilisable au doigt. La hauteur
          // précédente (32 px) rendait ces liens difficiles à viser sur
          // téléphone, notamment pendant l'onboarding.
          className="min-h-11 inline-flex items-center underline decoration-gray-600 underline-offset-4 hover:text-orange-300 focus-visible:text-orange-300"
        >
          {labels[index]}
        </a>
      ))}
    </nav>
  );
}

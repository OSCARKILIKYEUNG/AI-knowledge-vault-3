import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export async function fetchOpenGraph(url: string): Promise<{ title?: string; description?: string }> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/) ||
                      html.match(/<title>([^<]*)</);
    const descMatch = html.match(/<meta property="og:description" content="([^"]*)"/) ||
                     html.match(/<meta name="description" content="([^"]*)">/);
    
    return {
      title: titleMatch?.[1],
      description: descMatch?.[1],
    };
  } catch (error) {
    console.error('Error fetching Open Graph data:', error);
    return {};
  }
}
import { PROXY } from '../core/constants';

export async function fetchContents(path: string): Promise<any> {
  const res = await fetch(PROXY + '/contents/' + path, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error('API ' + res.status);
  return res.json();
}

export async function fetchPDF(path: string): Promise<ArrayBuffer> {
  const res = await fetch(PROXY + '/raw/master/' + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.arrayBuffer();
}

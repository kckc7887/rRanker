import { useCallback, useEffect, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useNotification } from '@/components/AppNotification';
import { decodeMaimaiQrFromImageUri, extractMaimaiQrPayload } from '@/services/maimai-qr-decode';
import { getForegroundAbortSignal } from '@/state/app-lifecycle';

export function useUploadQrInput(visible: boolean, running: boolean, uploadMethod: 'friend_code' | 'qr') {
  const { showNotification } = useNotification();
  const [bindQrText, setBindQrText] = useState('');
  const [decodingQr, setDecodingQr] = useState(false);
  const generationRef = useRef(0);
  const decodeRef = useRef<AbortController | null>(null);
  const choosingRef = useRef(false);
  const reset = useCallback(() => {
    generationRef.current += 1;
    decodeRef.current?.abort();
    decodeRef.current = null;
    choosingRef.current = false;
    setBindQrText('');
    setDecodingQr(false);
  }, []);
  useEffect(() => {
    if (!visible || (uploadMethod !== 'qr' && !running)) reset();
  }, [visible, uploadMethod, running, reset]);
  useEffect(() => () => {
    generationRef.current += 1;
    decodeRef.current?.abort();
  }, []);
  const applyQrText = (raw: string) => {
    const extracted = extractMaimaiQrPayload(raw) ?? raw.trim();
    setBindQrText(extracted);
  };

  const pickQrImage = async () => {
    if (running || choosingRef.current || !visible || uploadMethod !== 'qr') return;
    choosingRef.current = true;
    const generation = ++generationRef.current;
    let assetUri: string | undefined;
    let foreground: AbortSignal | undefined;
    const controller = new AbortController();
    decodeRef.current = controller;
    const forwardAbort = () => controller.abort(foreground?.reason);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (generation !== generationRef.current) return;
      if (!permission.granted) {
        showNotification({ title: '需要相册权限', message: '请允许访问相册后再选择二维码图片。', variant: 'warning' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
      if (result.canceled) return;
      assetUri = result.assets[0]?.uri;
      if (generation !== generationRef.current) return;
      if (!assetUri) {
        showNotification({ title: '选择图片失败', message: '没有读取到二维码图片。', variant: 'warning' });
        return;
      }
      setDecodingQr(true);
      foreground = getForegroundAbortSignal();
      if (foreground.aborted) forwardAbort();
      else foreground.addEventListener('abort', forwardAbort, { once: true });
      const payload = await decodeMaimaiQrFromImageUri(assetUri, controller.signal);
      if (generation !== generationRef.current || controller.signal.aborted) return;
      applyQrText(payload);
      showNotification({ title: '已识别二维码', message: '玩家二维码已填入，可以开始同步成绩。', variant: 'success' });
    } catch {
      if (generation !== generationRef.current) return;
      showNotification({
        title: controller.signal.aborted ? '识别已停止' : '识别失败',
        message: controller.signal.aborted ? '回到应用后请重新选择二维码图片。' : '无法识别二维码，请换一张图片重试。',
        variant: controller.signal.aborted ? 'warning' : 'error',
      });
    } finally {
      foreground?.removeEventListener('abort', forwardAbort);
      if (generation === generationRef.current) {
        choosingRef.current = false;
        decodeRef.current = null;
        setDecodingQr(false);
      }
      if (assetUri?.startsWith('file:')) {
        try {
          const cacheRoot = `${Paths.normalize(decodeURIComponent(Paths.cache.uri)).replace(/\/+$/, '')}/`;
          const pickedFile = Paths.normalize(decodeURIComponent(assetUri));
          if (pickedFile.startsWith(cacheRoot)) new File(assetUri).delete();
        } catch { /* The picker cache copy may already be gone. */ }
      }
    }
  };

  const pasteQrText = async () => {
    if (running || decodingQr || !visible || uploadMethod !== 'qr') return;
    const generation = generationRef.current;
    const text = (await Clipboard.getStringAsync()).trim();
    if (generation !== generationRef.current) return;
    if (!text) {
      showNotification({
        title: '剪贴板为空',
        message: '请先复制公众号玩家二维码字符串。',
        variant: 'warning',
      });
      return;
    }
    applyQrText(text);
  };

  return { bindQrText, setBindQrText, decodingQr, pickQrImage, pasteQrText,
    reset };
}

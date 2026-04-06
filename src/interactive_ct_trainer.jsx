import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookOpen, CheckCircle2, Crop as CropToolIcon, Eye, EyeOff, ImagePlus, Lock, Plus, RefreshCw, RotateCcw, Search, Trash2, Upload, XCircle } from 'lucide-react';
import ReactCrop, { centerCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  useCloudCases,
  fetchCasesRemote,
  loginRemote,
  buildCaseFormData,
  createCaseRemote,
  patchCaseRemoteJson,
  patchCaseRemoteMultipart,
  deleteCaseRemote,
  getStoredApiKey,
  clearStoredApiKey,
  imageUrlToUploadableFile,
} from '@/lib/caseApi';
import { FIELD_LIMITS, countChars } from '@/lib/fieldLimits';
import { stripImageToCleanDataUrl } from '@/lib/stripImageMetadata';
import { getDataUrlFromPixelCrop } from '@/lib/applyPixelCrop';

const PUBLIC_TEACHING_PREFIX = '/teaching-images/';
const PUBLIC_MANIFEST_URL = `${PUBLIC_TEACHING_PREFIX}manifest.json`;

const ADMIN_PASS = 'neuro';
const LS_CASES = 'ct-trainer-cases-v1';
const SS_ADMIN = 'ct-trainer-admin';

function publicImageUrlFromName(name) {
  return PUBLIC_TEACHING_PREFIX + encodeURIComponent(name);
}

function makeCtPlaceholder(kind) {
  const svgs = {
    ich: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#050505"/>
        <circle cx="256" cy="256" r="190" fill="#1a1a1a"/>
        <ellipse cx="256" cy="256" rx="150" ry="178" fill="#2e2e2e"/>
        <ellipse cx="210" cy="256" rx="34" ry="48" fill="#f7f7f7"/>
        <ellipse cx="256" cy="256" rx="18" ry="72" fill="#4a4a4a"/>
        <ellipse cx="302" cy="256" rx="34" ry="48" fill="#5a5a5a"/>
      </svg>
    `,
    sah: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#050505"/>
        <circle cx="256" cy="256" r="190" fill="#1a1a1a"/>
        <ellipse cx="256" cy="256" rx="150" ry="178" fill="#2b2b2b"/>
        <path d="M210 220 L256 180 L302 220 L280 250 L256 230 L232 250 Z" fill="#efefef"/>
        <path d="M205 275 Q256 245 307 275" stroke="#f5f5f5" stroke-width="16" fill="none" stroke-linecap="round"/>
      </svg>
    `,
    sdh: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#050505"/>
        <circle cx="256" cy="256" r="190" fill="#1a1a1a"/>
        <ellipse cx="256" cy="256" rx="150" ry="178" fill="#2b2b2b"/>
        <path d="M120 125 Q78 256 120 387 Q160 355 176 256 Q160 157 120 125 Z" fill="#ededed"/>
      </svg>
    `,
    ischemia: `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
        <rect width="512" height="512" fill="#050505"/>
        <circle cx="256" cy="256" r="190" fill="#1a1a1a"/>
        <ellipse cx="256" cy="256" rx="150" ry="178" fill="#2f2f2f"/>
        <ellipse cx="210" cy="250" rx="48" ry="72" fill="#414141"/>
        <ellipse cx="302" cy="250" rx="48" ry="72" fill="#565656"/>
      </svg>
    `,
  };
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgs[kind])}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function normalizeStoredCase(c) {
  const lesion = c.lesion && typeof c.lesion === 'object'
    ? { x: Number(c.lesion.x) || 50, y: Number(c.lesion.y) || 50, r: Number(c.lesion.r) || 10, label: String(c.lesion.label || '') }
    : { x: 50, y: 50, r: 10, label: '' };
  const primary =
    (Array.isArray(c.imageUrls) && c.imageUrls.find((u) => u && String(u).trim())) ||
    c.imageUrl ||
    '';
  return {
    id: c.id || uid(),
    title: c.title || 'เคสไม่มีชื่อ',
    pattern: c.pattern || 'ทั่วไป',
    tags: Array.isArray(c.tags) ? c.tags : [],
    description: c.description || '',
    narrative: typeof c.narrative === 'string' ? c.narrative : (c.teachingPoint || c.description || ''),
    teachingPoint: c.teachingPoint || '',
    imageUrl: primary,
    imageKey: c.imageKey,
    lesion,
  };
}

const DEFAULT_CASES_RAW = [
  {
    id: 'demo-ich',
    title: 'ICH demo',
    pattern: 'Intracerebral hemorrhage',
    tags: ['Hemorrhage', 'ICH', 'NCCT'],
    description: 'คลิกตำแหน่งเลือดออกใน basal ganglia',
    narrative: 'ผู้ป่วยมาด้วยอาการอ่อนแรงครึ่งซีกข้างขวา ความดันสูง บน CT brain non-contrast พบรอยสว่าง (hyperdensity) ในเนื้อสมองลึก ลักษณะคล้ายเลือดออกในเนื้อสมอง (ICH) ลองดู basal ganglia และบริเวณใกล้ internal capsule',
    teachingPoint: 'ICH มักเป็นรอยขาวสว่างในเนื้อสมอง และเป็นข้อห้ามของ IV thrombolysis',
    imageUrl: makeCtPlaceholder('ich'),
    lesion: { x: 41, y: 50, r: 10 },
  },
  {
    id: 'demo-sah',
    title: 'SAH demo',
    pattern: 'Subarachnoid hemorrhage',
    tags: ['Hemorrhage', 'SAH', 'NCCT'],
    description: 'คลิกบริเวณเลือดใน basal cisterns',
    narrative: 'ผู้ป่วยปวดหัวเฉียบพลันรุนแรง Thunderclap headache บน NCCT ควรมองหาเลือดใน subarachnoid space โดยเฉพาะรอบๆ basal cisterns และ sulci',
    teachingPoint: 'SAH มักเห็น hyperdensity ตาม basal cisterns และ sulci',
    imageUrl: makeCtPlaceholder('sah'),
    lesion: { x: 50, y: 44, r: 12 },
  },
  {
    id: 'demo-sdh',
    title: 'SDH demo',
    pattern: 'Subdural hematoma',
    tags: ['Trauma', 'SDH', 'Extra-axial'],
    description: 'คลิกตำแหน่ง hematoma รูปพระจันทร์เสี้ยว',
    narrative: 'ประวัติ trauma หรือรับยาละลายลิ่มเลือด ภาพ CT อาจเห็นเลือดระหว่าง dura กับ brain เป็นรูปพระจันทร์เสี้ยว (crescent) มักอยู่ด้านใดด้านหนึ่งของซีกสมอง',
    teachingPoint: 'SDH เป็น crescent shape และมักข้าม suture ได้',
    imageUrl: makeCtPlaceholder('sdh'),
    lesion: { x: 25, y: 50, r: 12 },
  },
  {
    id: 'demo-ischemia',
    title: 'Early ischemia demo',
    pattern: 'Early ischemic change',
    tags: ['Ischemia', 'Early stroke', 'ASPECTS'],
    description: 'คลิกบริเวณ early hypodensity',
    narrative: 'ในระยะแรกของ ischemic stroke อาจเห็น hypodensity เล็กน้อย หรือเสียการมองเห็นขอบเทา–ขาวของสมอง (loss of gray-white differentiation) ลองหาบริเวณที่สมมาตรกับอาการทางคลินิก',
    teachingPoint: 'Early ischemia มักเป็น hypodensity เล็กน้อยหรือ loss of gray-white differentiation',
    imageUrl: makeCtPlaceholder('ischemia'),
    lesion: { x: 38, y: 49, r: 11 },
  },
];

const DEFAULT_CASES = DEFAULT_CASES_RAW.map(normalizeStoredCase);

function loadCasesFromStorage() {
  try {
    const raw = localStorage.getItem(LS_CASES);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed.map(normalizeStoredCase).filter((c) => c.imageUrl);
    return normalized.length ? normalized : null;
  } catch {
    return null;
  }
}

function pctFromClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function adminSessionOk() {
  if (typeof sessionStorage === 'undefined') return false;
  if (sessionStorage.getItem(SS_ADMIN) !== '1') return false;
  if (useCloudCases && !getStoredApiKey()) return false;
  return true;
}

export default function CtBrainTeachingStudio() {
  const [cases, setCases] = useState(() => (useCloudCases ? [] : loadCasesFromStorage() || DEFAULT_CASES));
  const [activeId, setActiveId] = useState(() => {
    if (useCloudCases) return '';
    return (loadCasesFromStorage() || DEFAULT_CASES)[0]?.id || '';
  });
  const [remoteLoading, setRemoteLoading] = useState(useCloudCases);
  const [remoteError, setRemoteError] = useState(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [attempts, setAttempts] = useState([]);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState('ทั้งหมด');
  const [learnerTab, setLearnerTab] = useState('read');
  const [isAdmin, setIsAdmin] = useState(adminSessionOk);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [adminTab, setAdminTab] = useState('edit');

  const importInputRef = useRef(null);

  const [publicImageFiles, setPublicImageFiles] = useState([]);
  const [publicListLoading, setPublicListLoading] = useState(false);
  const [publicListError, setPublicListError] = useState(false);
  const [publicImageFilter, setPublicImageFilter] = useState('');
  const [stripMetadataOnUpload, setStripMetadataOnUpload] = useState(true);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState('');
  const [cropSessionKey, setCropSessionKey] = useState(0);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [cropHelpOpen, setCropHelpOpen] = useState(false);
  const cropImgRef = useRef(null);
  const fileInputRef = useRef(null);

  const [editor, setEditor] = useState({
    title: '',
    pattern: '',
    tags: 'NCCT, สอน',
    description: '',
    narrative: '',
    teachingPoint: '',
    imageUrl: '',
    lesion: { x: 50, y: 50, r: 10, label: '' },
  });

  React.useEffect(() => {
    if (useCloudCases) return;
    try {
      localStorage.setItem(LS_CASES, JSON.stringify(cases));
    } catch {
      /* ignore quota */
    }
  }, [cases]);

  React.useEffect(() => {
    if (!useCloudCases) return;
    let cancelled = false;
    (async () => {
      setRemoteLoading(true);
      setRemoteError(null);
      try {
        const list = await fetchCasesRemote();
        if (cancelled) return;
        const normalized = list.map((c) => normalizeStoredCase(c));
        setCases(normalized);
        setActiveId((prev) => {
          if (prev && normalized.some((x) => x.id === prev)) return prev;
          return normalized[0]?.id || '';
        });
      } catch (e) {
        if (!cancelled) setRemoteError(String(e.message || e));
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPublicTeachingManifest = useCallback(async () => {
    setPublicListLoading(true);
    setPublicListError(false);
    try {
      const res = await fetch(`${PUBLIC_MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('manifest');
      const data = await res.json();
      const files = Array.isArray(data.files) ? data.files : [];
      setPublicImageFiles(files);
    } catch {
      setPublicListError(true);
      setPublicImageFiles([]);
    } finally {
      setPublicListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPublicTeachingManifest();
  }, [loadPublicTeachingManifest]);

  const filteredPublicImages = useMemo(() => {
    const q = publicImageFilter.trim().toLowerCase();
    if (!q) return publicImageFiles;
    return publicImageFiles.filter((f) => f.toLowerCase().includes(q));
  }, [publicImageFiles, publicImageFilter]);

  const patterns = useMemo(() => ['ทั้งหมด', ...Array.from(new Set(cases.map((c) => c.pattern)))], [cases]);
  const filteredCases = useMemo(() => {
    return selectedPattern === 'ทั้งหมด' ? cases : cases.filter((c) => c.pattern === selectedPattern);
  }, [cases, selectedPattern]);

  const activeCase = useMemo(() => {
    const fromFiltered = filteredCases.find((c) => c.id === activeId);
    return fromFiltered || filteredCases[0] || cases[0] || null;
  }, [filteredCases, activeId, cases]);

  React.useEffect(() => {
    if (activeCase && activeCase.id !== activeId) setActiveId(activeCase.id);
  }, [activeCase, activeId]);

  React.useEffect(() => {
    if (!activeCase) return;
    setAttempts([]);
    setAnswered(false);
    setShowAnswer(false);
    setLearnerTab('read');
  }, [activeCase?.id]);

  const handleTrainClick = (e) => {
    if (!activeCase || answered) return;
    const point = pctFromClick(e);
    const correct = distance(point, activeCase.lesion) <= activeCase.lesion.r;
    setAttempts((prev) => [...prev, { ...point, correct }]);
    if (correct) {
      setAnswered(true);
      setShowAnswer(true);
      setScore((s) => s + 1);
    }
  };

  const fillEditorFromCase = (c) => {
    setEditor({
      title: c.title,
      pattern: c.pattern,
      tags: c.tags.join(', '),
      description: c.description,
      narrative: c.narrative || '',
      teachingPoint: c.teachingPoint,
      imageUrl: c.imageUrl || '',
      lesion: { ...c.lesion, label: String(c.lesion?.label || '') },
    });
  };

  const handleLocalImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('รองรับเฉพาะรูปแบบภาพ (JPG, PNG, WebP ฯลฯ)\nไฟล์ DICOM (.dcm) ให้ส่งออกเป็น JPG/PNG จากโปรแกรมดูภาพก่อน');
      e.target.value = '';
      return;
    }
    if (stripMetadataOnUpload) {
      try {
        const dataUrl = await stripImageToCleanDataUrl(file);
        setEditor((prev) => ({ ...prev, imageUrl: dataUrl }));
        e.target.value = '';
        return;
      } catch (err) {
        console.error(err);
        window.alert(`ลบ metadata ออกจากรูปไม่สำเร็จ: ${String(err.message || err)}\nลองปิดตัวเลือก "ลบ metadata" หรือใช้ไฟล์อื่น`);
        e.target.value = '';
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEditor((prev) => ({ ...prev, imageUrl: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const onCropImageLoad = useCallback((e) => {
    const el = e.currentTarget;
    const { width, height, naturalWidth, naturalHeight } = el;
    if (!width || !height || !naturalWidth || !naturalHeight) return;
    const applyInitialCrop = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      /* กรอบเริ่มต้นแบบอิสระ (ไม่ล็อกสัดส่วนภาพ) — เหมาะกับการตัดแถบชื่อ/สเกลด้านล่าง */
      const c = centerCrop({ unit: '%', width: 92, height: 86 }, w, h);
      setCrop(c);
      setCompletedCrop(convertToPixelCrop(c, w, h));
    };
    applyInitialCrop();
    requestAnimationFrame(applyInitialCrop);
  }, []);

  const openCropModal = () => {
    if (!editor.imageUrl) return;
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCropSessionKey((k) => k + 1);
    setCropSrc(editor.imageUrl);
    setCropModalOpen(true);
  };

  const closeCropModal = () => {
    setCropModalOpen(false);
    setCropSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setCropHelpOpen(false);
  };

  const applyImageCrop = () => {
    const img = cropImgRef.current;
    if (!img || !completedCrop?.width || !completedCrop?.height) {
      window.alert('ยังไม่มีกรอบตัด — รอให้รูปโหลดเสร็จ แล้วลากมุมสี่เหลี่ยมสีฟ้าขาวบนภาพ หรือลองกดปุ่มตัดภาพอีกครั้ง');
      return;
    }
    try {
      const mime = cropSrc.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const url = getDataUrlFromPixelCrop(img, completedCrop, mime);
      setEditor((p) => ({ ...p, imageUrl: url, lesion: { x: 50, y: 50, r: p.lesion.r, label: p.lesion.label || '' } }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      closeCropModal();
    } catch (err) {
      console.error(err);
      window.alert(`ตัดรูปไม่สำเร็จ: ${String(err.message || err)}\nถ้าเป็นรูปจาก URL อื่น อาจต้องตั้ง CORS ที่โฮสต์รูป หรืออัปโหลดไฟล์จากเครื่องแทน`);
    }
  };

  const fieldOverflow =
    countChars(editor.title) > FIELD_LIMITS.title ||
    countChars(editor.pattern) > FIELD_LIMITS.pattern ||
    countChars(editor.tags) > FIELD_LIMITS.tagsJoined ||
    countChars(editor.description) > FIELD_LIMITS.description ||
    countChars(editor.narrative) > FIELD_LIMITS.narrative ||
    countChars(editor.teachingPoint) > FIELD_LIMITS.teachingPoint ||
    countChars(editor.lesion?.label) > FIELD_LIMITS.lesionLabel;

  const addCase = async () => {
    if (!editor.title || !editor.pattern || !editor.imageUrl || fieldOverflow) return;
    if (useCloudCases) {
      try {
        const file =
          fileInputRef.current?.files?.[0] ||
          (await imageUrlToUploadableFile(editor.imageUrl, 'case.jpg'));
        if (!file) {
          window.alert('โหมดคลาวด์: ต้องมีไฟล์รูป (อัปโหลดหรือรูปที่เปิด fetch ได้)');
          return;
        }
        const fd = buildCaseFormData(editor);
        fd.append('image', file);
        const created = await createCaseRemote(fd);
        const newCase = normalizeStoredCase(created);
        setCases((prev) => [newCase, ...prev]);
        setActiveId(newCase.id);
        setSelectedPattern('ทั้งหมด');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setEditor({
          title: '',
          pattern: '',
          tags: 'NCCT, สอน',
          description: '',
          narrative: '',
          teachingPoint: '',
          imageUrl: '',
          lesion: { x: 50, y: 50, r: 10, label: '' },
        });
      } catch (e) {
        window.alert(String(e.message || e));
      }
      return;
    }
    const newCase = normalizeStoredCase({
      id: uid(),
      title: editor.title,
      pattern: editor.pattern,
      tags: editor.tags.split(',').map((s) => s.trim()).filter(Boolean),
      description: editor.description,
      narrative: editor.narrative,
      teachingPoint: editor.teachingPoint,
      imageUrl: editor.imageUrl,
      lesion: { ...editor.lesion },
    });
    setCases((prev) => [newCase, ...prev]);
    setActiveId(newCase.id);
    setSelectedPattern('ทั้งหมด');
    setEditor({
      title: '',
      pattern: '',
      tags: 'NCCT, สอน',
      description: '',
      narrative: '',
      teachingPoint: '',
      imageUrl: '',
      lesion: { x: 50, y: 50, r: 10, label: '' },
    });
  };

  const updateCurrentCase = async () => {
    if (!activeCase || fieldOverflow) return;
    if (useCloudCases) {
      try {
        const tagsArr = editor.tags.split(',').map((s) => s.trim()).filter(Boolean);
        const fileInput = fileInputRef.current?.files?.[0];
        const imageChanged =
          editor.imageUrl !== activeCase.imageUrl ||
          Boolean(fileInput);
        if (imageChanged) {
          const file =
            fileInput ||
            (await imageUrlToUploadableFile(editor.imageUrl, 'case.jpg'));
          if (!file) {
            window.alert('ไม่มีไฟล์รูปสำหรับอัปเดต — ลองอัปโหลดรูปใหม่');
            return;
          }
          const fd = buildCaseFormData(editor);
          fd.append('image', file);
          const updated = await patchCaseRemoteMultipart(activeCase.id, fd);
          setCases((prev) => prev.map((c) => (c.id === activeCase.id ? normalizeStoredCase(updated) : c)));
        } else {
          const updated = await patchCaseRemoteJson(activeCase.id, {
            title: editor.title,
            pattern: editor.pattern,
            tags: tagsArr,
            description: editor.description,
            narrative: editor.narrative,
            teachingPoint: editor.teachingPoint,
            lesion: { ...editor.lesion },
          });
          setCases((prev) => prev.map((c) => (c.id === activeCase.id ? normalizeStoredCase(updated) : c)));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (e) {
        window.alert(String(e.message || e));
      }
      return;
    }
    setCases((prev) => prev.map((c) => c.id === activeCase.id ? normalizeStoredCase({
      ...c,
      title: editor.title,
      pattern: editor.pattern,
      tags: editor.tags.split(',').map((s) => s.trim()).filter(Boolean),
      description: editor.description,
      narrative: editor.narrative,
      teachingPoint: editor.teachingPoint,
      imageUrl: editor.imageUrl,
      lesion: { ...editor.lesion, label: String(editor.lesion?.label || '') },
    }) : c));
  };

  const deleteCurrentCase = async () => {
    if (!activeCase) return;
    if (useCloudCases) {
      try {
        await deleteCaseRemote(activeCase.id);
        const next = cases.filter((c) => c.id !== activeCase.id);
        setCases(next);
        setActiveId(next[0]?.id || '');
      } catch (e) {
        window.alert(String(e.message || e));
      }
      return;
    }
    const next = cases.filter((c) => c.id !== activeCase.id);
    setCases(next.length ? next : DEFAULT_CASES);
    setActiveId((next.length ? next : DEFAULT_CASES)[0]?.id || '');
    if (!next.length) {
      try {
        localStorage.removeItem(LS_CASES);
      } catch { /* ignore */ }
    }
  };

  const exportCases = () => {
    const clean = cases.map(({ id, ...rest }) => rest);
    downloadJson('ct-brain-teaching-cases.json', clean);
  };

  const importCases = async (e) => {
    if (useCloudCases) {
      window.alert('โหมดคลาวด์: ใช้ Turso เป็นหลัก — นำเข้า JSON แบบเดิมยังไม่รองรับ (ให้เพิ่มเคสผ่านฟอร์มหรือ API)');
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return;
    const normalized = parsed.map((c) => normalizeStoredCase({
      id: uid(),
      title: c.title,
      pattern: c.pattern,
      tags: Array.isArray(c.tags) ? c.tags : [],
      description: c.description || '',
      narrative: c.narrative,
      teachingPoint: c.teachingPoint || '',
      imageUrl: c.imageUrl || '',
      lesion: c.lesion,
    })).filter((c) => c.imageUrl);
    if (!normalized.length) return;
    setCases(normalized);
    setActiveId(normalized[0].id);
    setSelectedPattern('ทั้งหมด');
  };

  const tryLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (useCloudCases) {
      try {
        await loginRemote(loginPass);
        sessionStorage.setItem(SS_ADMIN, '1');
        setIsAdmin(true);
        setLoginOpen(false);
        setLoginPass('');
        setAdminTab('edit');
      } catch (err) {
        setLoginError(String(err.message || err));
      }
      return;
    }
    if (loginPass === ADMIN_PASS) {
      sessionStorage.setItem(SS_ADMIN, '1');
      setIsAdmin(true);
      setLoginOpen(false);
      setLoginError('');
      setLoginPass('');
      setAdminTab('edit');
    } else {
      setLoginError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  const logoutAdmin = () => {
    sessionStorage.removeItem(SS_ADMIN);
    clearStoredApiKey();
    setIsAdmin(false);
  };

  const accuracyText = answered ? 'ถูกต้อง' : attempts.length ? 'ลองใหม่' : 'พร้อมเริ่ม';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-50/40 p-4 pb-12 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Card className="overflow-hidden rounded-3xl border-0 bg-white/85 shadow-lg shadow-slate-200/60 ring-1 ring-slate-200/80 backdrop-blur-md">
          <CardHeader className="border-b border-slate-100/90 bg-gradient-to-r from-white via-cyan-50/20 to-transparent pb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-2xl font-bold tracking-tight text-transparent md:text-3xl">
                  CT Brain — อ่านเคส & แบบทดสอบ
                </CardTitle>
                <CardDescription className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                  ผู้เรียน: เลือกเคสจากรายการ → แท็บ <strong className="font-semibold text-slate-800">อ่านเคส</strong> เพื่ออ่านเรื่องราวและดูภาพ → แท็บ <strong className="font-semibold text-slate-800">แบบทดสอบ</strong> เพื่อคลิกตำแหน่งที่สงสัยว่าเป็น lesion
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full border border-slate-200/80 bg-slate-100/90 px-3 py-1 font-medium text-slate-700">เคสทั้งหมด {cases.length}</Badge>
                {!isAdmin ? (
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setLoginOpen(true); setLoginError(''); }}>
                    <Lock className="mr-2 h-4 w-4" />
                    เข้าสู่ระบบผู้ดูแล
                  </Button>
                ) : (
                  <>
                    <Badge className="rounded-full bg-emerald-700 px-3 py-1 hover:bg-emerald-700">ผู้ดูแล</Badge>
                    <Button type="button" variant="outline" className="rounded-xl" onClick={logoutAdmin}>
                      ออกจากระบบ
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {useCloudCases && remoteLoading && (
          <Alert className="rounded-2xl border-slate-200">
            <AlertDescription>กำลังโหลดเคสจากเซิร์ฟเวอร์ (Turso)…</AlertDescription>
          </Alert>
        )}
        {useCloudCases && remoteError && (
          <Alert className="rounded-2xl border-red-200 bg-red-50">
            <AlertDescription className="text-red-900">
              โหลดจากคลาวด์ไม่สำเร็จ: {remoteError} — ตรวจสอบว่ารัน <span className="font-mono">npm run server</span> และตั้งค่า Turso / R2 ในไฟล์ <span className="font-mono">.env</span>
            </AlertDescription>
          </Alert>
        )}
        {useCloudCases && !remoteLoading && !remoteError && (
          <Alert className="rounded-2xl border-emerald-200 bg-emerald-50/60">
            <AlertDescription className="text-emerald-950">
              โหมดคลาวด์: รูปเก็บที่ <strong>R2</strong> ข้อความ/เมตาดาตาเก็บที่ <strong>Turso</strong> — ความยาวข้อความถูกจำกัดเพื่อลดขนาดแถว (ดูที่มุมฟิลด์)
            </AlertDescription>
          </Alert>
        )}

        {isAdmin && (
          <Card className="rounded-3xl border border-emerald-200/60 bg-gradient-to-br from-white via-emerald-50/15 to-cyan-50/20 shadow-lg shadow-emerald-900/5 ring-1 ring-emerald-100/80">
            <CardHeader className="border-b border-emerald-100/60 bg-gradient-to-r from-emerald-50/40 to-transparent">
              <CardTitle className="text-xl font-semibold text-emerald-950">โหมดผู้ดูแล (อาจารย์)</CardTitle>
              <CardDescription className="text-slate-600">
                สร้าง/แก้ไขเคส ใส่รูป CT จุดชี้ lesion และข้อความให้ผู้เรียน — ข้อมูลจะถูกเก็บในเครื่องนี้ (เบราว์เซอร์) โดยอัตโนมัติ
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Tabs value={adminTab} onValueChange={setAdminTab} className="space-y-5">
                <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 rounded-2xl border-slate-200/80 bg-slate-100/90 p-1.5 shadow-inner">
                  <TabsTrigger value="edit" className="rounded-xl py-2.5">สร้าง / แก้ไขเคส</TabsTrigger>
                  <TabsTrigger value="backup" className="rounded-xl py-2.5">สำรองข้อมูล (ขั้นสูง)</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-6">
                  <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                    <Card className="rounded-3xl border border-slate-200/80 bg-white/90 shadow-md shadow-slate-200/40 ring-1 ring-slate-100">
                      <CardHeader className="space-y-1 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white pb-5">
                        <CardTitle className="text-lg font-semibold tracking-tight text-slate-800">แบบฟอร์มเคส</CardTitle>
                        <CardDescription className="text-slate-600">กรอกข้อความ เลือกรูป แล้วคลิกบนภาพเพื่อวางจุด lesion (วงสีฟ้า)</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5 pt-6">
                        {fieldOverflow && (
                          <Alert className="rounded-2xl border-amber-200/80 bg-amber-50/90 shadow-sm">
                            <AlertDescription className="text-sm text-amber-950">
                              ข้อความยาวเกินขีดจำกัด (เพื่อลดขนาดใน Turso) — ลดตัวอักษรในช่องที่ตัวเลขเป็นสีแดงก่อนบันทึก
                            </AlertDescription>
                          </Alert>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="ct-field space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <Label className="ct-label">ชื่อเคส</Label>
                              <span className={`ct-char ${countChars(editor.title) > FIELD_LIMITS.title ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                                {countChars(editor.title)}/{FIELD_LIMITS.title}
                              </span>
                            </div>
                            <Input value={editor.title} onChange={(e) => setEditor((p) => ({ ...p, title: e.target.value }))} placeholder="เช่น ICH ฝั่งซ้าย" />
                          </div>
                          <div className="ct-field space-y-2">
                            <div className="flex items-baseline justify-between gap-2">
                              <Label className="ct-label">กลุ่ม / pattern</Label>
                              <span className={`ct-char ${countChars(editor.pattern) > FIELD_LIMITS.pattern ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                                {countChars(editor.pattern)}/{FIELD_LIMITS.pattern}
                              </span>
                            </div>
                            <Input value={editor.pattern} onChange={(e) => setEditor((p) => ({ ...p, pattern: e.target.value }))} placeholder="เช่น ICH, SAH, SDH" />
                          </div>
                        </div>
                        <div className="ct-field space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <Label className="ct-label">แท็ก (คั่นด้วยจุลภาค)</Label>
                            <span className={`ct-char ${countChars(editor.tags) > FIELD_LIMITS.tagsJoined ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                              {countChars(editor.tags)}/{FIELD_LIMITS.tagsJoined}
                            </span>
                          </div>
                          <Input value={editor.tags} onChange={(e) => setEditor((p) => ({ ...p, tags: e.target.value }))} placeholder="NCCT, ER" />
                        </div>
                        <div className="ct-field space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <Label className="ct-label">เรื่องราวให้ผู้เรียนอ่าน</Label>
                            <span className={`ct-char ${countChars(editor.narrative) > FIELD_LIMITS.narrative ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                              {countChars(editor.narrative)}/{FIELD_LIMITS.narrative}
                            </span>
                          </div>
                          <Textarea
                            className="min-h-[128px]"
                            value={editor.narrative}
                            onChange={(e) => setEditor((p) => ({ ...p, narrative: e.target.value }))}
                            placeholder="เล่า HPI / บริบทคลินิก และสิ่งที่อยากให้ผู้เรียนสังเกตบนภาพ (ภาษาไทยได้)"
                          />
                        </div>
                        <div className="ct-field space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <Label className="ct-label">คำถามตอนทำแบบทดสอบ (สั้น ๆ)</Label>
                            <span className={`ct-char ${countChars(editor.description) > FIELD_LIMITS.description ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                              {countChars(editor.description)}/{FIELD_LIMITS.description}
                            </span>
                          </div>
                          <Textarea value={editor.description} onChange={(e) => setEditor((p) => ({ ...p, description: e.target.value }))} placeholder="เช่น คลิกตำแหน่งที่คิดว่าเป็นเลือดออก" />
                        </div>
                        <div className="ct-field space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <Label className="ct-label">สรุปสำหรับอาจารย์ / เฉลยสั้น</Label>
                            <span className={`ct-char ${countChars(editor.teachingPoint) > FIELD_LIMITS.teachingPoint ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                              {countChars(editor.teachingPoint)}/{FIELD_LIMITS.teachingPoint}
                            </span>
                          </div>
                          <Textarea value={editor.teachingPoint} onChange={(e) => setEditor((p) => ({ ...p, teachingPoint: e.target.value }))} placeholder="ข้อควรจำหลังดูภาพ" />
                        </div>

                        <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-white p-5 shadow-inner">
                          <p className="ct-section-title">รูป CT &amp; อัปโหลด</p>
                          <div className="space-y-2">
                            <Label className="ct-label">ที่อยู่รูป (URL) — หรือเว้นว่างแล้วอัปโหลดด้านล่าง</Label>
                            <Input value={editor.imageUrl} onChange={(e) => setEditor((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="https://... หรือเลือกจากโฟลเดอร์ teaching-images" />
                          </div>
                          <div className="rounded-2xl border border-cyan-200/70 bg-gradient-to-br from-cyan-50/60 via-white to-sky-50/40 p-4 shadow-sm">
                            <label className="flex cursor-pointer gap-3 text-sm leading-snug text-slate-700">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-700 focus:ring-cyan-500"
                                checked={stripMetadataOnUpload}
                                onChange={(e) => setStripMetadataOnUpload(e.target.checked)}
                              />
                              <span>
                                <span className="font-semibold text-slate-800">ลบ metadata ในรูป</span>
                                {' '}
                                <span className="text-slate-600">(EXIF / ข้อมูลแนบในไฟล์) ก่อนใช้ — แนะนำเปิดเพื่อ PDPA เหลือเฉพาะพิกเซลภาพ CT</span>
                              </span>
                            </label>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLocalImageUpload} />
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button type="button" className="rounded-xl shadow-sm" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" /> อัปโหลดรูป
                              </Button>
                              <Button type="button" variant="outline" className="rounded-xl border-slate-300 bg-white shadow-sm" disabled={!editor.imageUrl} onClick={openCropModal}>
                                <CropToolIcon className="mr-2 h-4 w-4" /> ตัดภาพ
                              </Button>
                            </div>
                          </div>
                        </div>
                        <Alert className="rounded-2xl border-l-4 border-l-sky-400 border-y-sky-100 border-r-sky-100 bg-sky-50/80 shadow-sm">
                          <AlertDescription className="text-sm leading-relaxed text-sky-950">
                            การลบ metadata จะวาดรูปใหม่จากพิกเซลเดิม จึงไม่เหลือชื่อหรือค่า EXIF ในไฟล์ — ไม่ลบข้อความที่ปะอยู่บนภาพ (burned-in) บนภาพ CT
                            หากต้องการซ่อนข้อความบนภาพ ใช้ปุ่ม <strong>ตัดภาพ</strong> เพื่อตัดมุมที่มีชื่อผู้ป่วยออก หรือปิด overlay ที่เครื่อง PACS ก่อนส่งออก
                          </AlertDescription>
                        </Alert>

                        <div className="space-y-4 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white p-5 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="ct-section-title">รูปในโฟลเดอร์ public/teaching-images</p>
                              <p className="mt-0.5 text-xs text-slate-500">ใส่ไฟล์แล้วรัน <span className="rounded bg-slate-200/60 px-1 font-mono text-[11px]">npm run teaching:scan</span></p>
                            </div>
                            <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-xl border-slate-300 bg-white shadow-sm" onClick={loadPublicTeachingManifest} disabled={publicListLoading}>
                              <RefreshCw className={`mr-2 h-4 w-4 ${publicListLoading ? 'animate-spin' : ''}`} />
                              รีเฟรช
                            </Button>
                          </div>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                            <Input className="rounded-xl pl-10" value={publicImageFilter} onChange={(e) => setPublicImageFilter(e.target.value)} placeholder="ค้นหาชื่อไฟล์..." />
                          </div>
                          {publicListError && (
                            <Alert className="rounded-xl border-amber-200 bg-amber-50">
                              <AlertDescription className="text-amber-900">โหลดรายการรูปไม่สำเร็จ</AlertDescription>
                            </Alert>
                          )}
                          {filteredPublicImages.length > 0 && (
                            <div className="grid max-h-52 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                              {filteredPublicImages.map((name) => {
                                const url = publicImageUrlFromName(name);
                                const selected = editor.imageUrl === url;
                                return (
                                  <button
                                    key={name}
                                    type="button"
                                    title={name}
                                    className={`overflow-hidden rounded-xl border bg-black text-left ${selected ? 'ring-2 ring-cyan-500 ring-offset-2' : 'border-slate-200'}`}
                                    onClick={() => setEditor((p) => ({ ...p, imageUrl: url }))}
                                  >
                                    <div className="aspect-square w-full">
                                      <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" />
                                    </div>
                                    <div className="truncate bg-white px-1 py-0.5 text-[10px] text-slate-700">{name}</div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="ct-field space-y-2">
                            <Label className="ct-label">Lesion X (%)</Label>
                            <Input type="number" value={editor.lesion.x} onChange={(e) => setEditor((p) => ({ ...p, lesion: { ...p.lesion, x: Number(e.target.value) } }))} />
                          </div>
                          <div className="ct-field space-y-2">
                            <Label className="ct-label">Lesion Y (%)</Label>
                            <Input type="number" value={editor.lesion.y} onChange={(e) => setEditor((p) => ({ ...p, lesion: { ...p.lesion, y: Number(e.target.value) } }))} />
                          </div>
                          <div className="ct-field space-y-2">
                            <Label className="ct-label">รัศมี (ทนการคลิก)</Label>
                            <Input type="number" value={editor.lesion.r} onChange={(e) => setEditor((p) => ({ ...p, lesion: { ...p.lesion, r: Number(e.target.value) } }))} />
                          </div>
                        </div>

                        <div className="ct-field space-y-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <Label className="ct-label">Label ของจุดเฉลย (ไม่บังคับ)</Label>
                            <span className={`ct-char ${countChars(editor.lesion?.label) > FIELD_LIMITS.lesionLabel ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                              {countChars(editor.lesion?.label)}/{FIELD_LIMITS.lesionLabel}
                            </span>
                          </div>
                          <Input
                            value={editor.lesion.label}
                            onChange={(e) => setEditor((p) => ({ ...p, lesion: { ...p.lesion, label: e.target.value } }))}
                            placeholder="เช่น BG ซ้าย / MCA territory / basal cistern"
                          />
                        </div>

                        <div className="rounded-3xl border-2 border-dashed border-cyan-200/60 bg-gradient-to-b from-cyan-50/30 to-slate-50/40 p-5 shadow-inner">
                          <div className="mb-3 text-sm font-medium text-slate-700">พรีวิว — คลิกบนภาพเพื่อวางจุดกลาง lesion</div>
                          <div
                            className="relative mx-auto aspect-square w-full max-w-2xl cursor-crosshair overflow-hidden rounded-2xl bg-black shadow-lg ring-2 ring-slate-900/10"
                            onClick={(e) => {
                              if (!editor.imageUrl) return;
                              const point = pctFromClick(e);
                              setEditor((p) => ({ ...p, lesion: { ...p.lesion, x: Math.round(point.x), y: Math.round(point.y) } }));
                            }}
                          >
                            {editor.imageUrl ? (
                              <>
                                <img src={editor.imageUrl} alt="ตัวอย่าง" className="h-full w-full object-contain" />
                                <div
                                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-cyan-400 bg-cyan-400/15"
                                  style={{
                                    left: `${editor.lesion.x}%`,
                                    top: `${editor.lesion.y}%`,
                                    width: `${editor.lesion.r * 4}px`,
                                    height: `${editor.lesion.r * 4}px`,
                                  }}
                                />
                                {editor.lesion.label ? (
                                  <div
                                    className="pointer-events-none absolute -translate-x-1/2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white"
                                    style={{ left: `${editor.lesion.x}%`, top: `calc(${editor.lesion.y}% + 14px)` }}
                                  >
                                    {editor.lesion.label}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="flex h-full items-center justify-center text-slate-400">
                                <div className="text-center">
                                  <ImagePlus className="mx-auto mb-3 h-10 w-10" />
                                  เลือกหรืออัปโหลดรูปก่อน
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                          <Button type="button" className="rounded-xl px-5 shadow-sm" onClick={addCase} disabled={fieldOverflow}>
                            <Plus className="mr-2 h-4 w-4" /> เพิ่มเคสใหม่
                          </Button>
                          <Button type="button" variant="outline" className="rounded-xl border-slate-300 bg-white px-5 shadow-sm" onClick={updateCurrentCase} disabled={fieldOverflow}>
                            บันทึกทับเคสที่เลือก
                          </Button>
                          <Button type="button" variant="destructive" className="rounded-xl px-5 shadow-sm" onClick={deleteCurrentCase}>
                            <Trash2 className="mr-2 h-4 w-4" /> ลบเคสที่เลือก
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
                      <CardHeader className="border-b border-slate-100 pb-4">
                        <CardTitle className="text-lg font-semibold text-slate-800">เคสในระบบ</CardTitle>
                        <CardDescription className="text-slate-600">คลิกเพื่อโหลดมาแก้ไขในฟอร์ม</CardDescription>
                      </CardHeader>
                      <CardContent className="max-h-[720px] space-y-2 overflow-auto pr-1 pt-4">
                        {cases.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`w-full rounded-2xl border p-3.5 text-left shadow-sm transition ${activeCase?.id === c.id ? 'border-cyan-600/40 bg-gradient-to-r from-cyan-50 to-sky-50/80 ring-1 ring-cyan-200/60' : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80'}`}
                            onClick={() => { setActiveId(c.id); fillEditorFromCase(c); }}
                          >
                            <div className="font-semibold text-slate-900">{c.title}</div>
                            <div className="mt-0.5 text-sm text-slate-600">{c.pattern}</div>
                          </button>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="backup" className="space-y-4">
                  <Alert className="rounded-2xl">
                    <AlertDescription>
                      ส่วนนี้สำหรับย้ายข้อมูลไปเครื่องอื่นหรือเก็บสำรอง — ผู้ใช้ทั่วไปไม่จำเป็นต้องใช้
                      {useCloudCases ? ' โหมดคลาวด์: แหล่งจริงคือ Turso + R2 — นำเข้า JSON แบบเดิมยังไม่รองรับ' : ''}
                    </AlertDescription>
                  </Alert>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="rounded-xl" onClick={exportCases}>ดาวน์โหลดไฟล์ JSON</Button>
                    <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={importCases} />
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => importInputRef.current?.click()} disabled={useCloudCases}>นำเข้าไฟล์ JSON</Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        <Tabs value={learnerTab} onValueChange={setLearnerTab} className="space-y-6">
          <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 gap-1 rounded-2xl border-slate-200/80 bg-slate-100/90 p-1.5 shadow-inner">
            <TabsTrigger value="read" className="rounded-xl py-2.5">
              <BookOpen className="mr-2 h-4 w-4" />
              อ่านเคส
            </TabsTrigger>
            <TabsTrigger value="quiz" className="rounded-xl py-2.5">แบบทดสอบ (คลิกบนภาพ)</TabsTrigger>
          </TabsList>

          <TabsContent value="read" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
              <Card className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">รายการเคส</CardTitle>
                  <CardDescription className="text-slate-600">เลือกเคสที่ต้องการอ่าน</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {patterns.map((p) => (
                      <Button key={p} type="button" variant={selectedPattern === p ? 'default' : 'outline'} size="sm" className={`rounded-xl shadow-sm ${selectedPattern !== p ? 'border-slate-300 bg-white' : ''}`} onClick={() => setSelectedPattern(p)}>
                        {p}
                      </Button>
                    ))}
                  </div>
                  <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                    {filteredCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full rounded-2xl border p-3.5 text-left shadow-sm transition ${activeCase?.id === c.id ? 'border-cyan-600/40 bg-gradient-to-r from-cyan-50 to-sky-50/80 ring-1 ring-cyan-200/60' : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80'}`}
                        onClick={() => setActiveId(c.id)}
                      >
                        <div className="font-semibold text-slate-900">{c.title}</div>
                        <div className="mt-0.5 text-sm text-slate-600">{c.pattern}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
                <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-transparent pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">{activeCase?.title || 'ยังไม่ได้เลือกเคส'}</CardTitle>
                  <CardDescription className="text-slate-600">{activeCase?.pattern}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  {activeCase ? (
                    <>
                      <div className="rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/40 p-5 text-base leading-relaxed text-slate-800 shadow-inner">
                        {(activeCase.narrative || activeCase.teachingPoint || 'ยังไม่มีเรื่องราวสำหรับเคสนี้ — ให้ผู้ดูแลเพิ่มในฟอร์ม "เรื่องราวให้ผู้เรียนอ่าน"').split('\n').map((para, i) => (
                          <p key={i} className={i > 0 ? 'mt-3' : ''}>{para}</p>
                        ))}
                      </div>
                      <div className="relative mx-auto aspect-square w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-lg ring-2 ring-slate-900/10">
                        <img src={activeCase.imageUrl} alt={activeCase.title} className="h-full w-full object-contain" draggable={false} />
                      </div>
                      <Button type="button" className="rounded-xl px-5 shadow-sm" onClick={() => setLearnerTab('quiz')}>
                        ไปทำแบบทดสอบ (คลิกบนภาพ)
                      </Button>
                    </>
                  ) : (
                    <Alert className="rounded-2xl"><AlertDescription>ไม่มีเคสในระบบ</AlertDescription></Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="quiz" className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full border-0 bg-cyan-600 px-3 py-1 text-white shadow-sm">คะแนนสะสม: {score}</Badge>
              <Badge variant="secondary" className="rounded-full border border-slate-200/80 bg-slate-100 px-3 py-1 text-slate-800 shadow-sm">สถานะ: {activeCase ? accuracyText : '—'}</Badge>
            </div>
            <div className="grid gap-6 lg:grid-cols-[300px_1fr_340px]">
              <Card className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">รายการเคส</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {patterns.map((p) => (
                      <Button key={p} type="button" variant={selectedPattern === p ? 'default' : 'outline'} size="sm" className={`rounded-xl shadow-sm ${selectedPattern !== p ? 'border-slate-300 bg-white' : ''}`} onClick={() => setSelectedPattern(p)}>
                        {p}
                      </Button>
                    ))}
                  </div>
                  <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
                    {filteredCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`w-full rounded-2xl border p-3.5 text-left shadow-sm transition ${activeCase?.id === c.id ? 'border-cyan-600/40 bg-gradient-to-r from-cyan-50 to-sky-50/80 ring-1 ring-cyan-200/60' : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/80'}`}
                        onClick={() => setActiveId(c.id)}
                      >
                        <div className="font-semibold text-slate-900">{c.title}</div>
                        <div className="mt-0.5 text-sm text-slate-600">{c.pattern}</div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
                <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-transparent pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">{activeCase?.title || '—'}</CardTitle>
                  <CardDescription className="text-slate-600">{activeCase?.description || 'คลิกบนภาพตามจุดที่สงสัย'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-5">
                  {activeCase ? (
                    <>
                      <div className="relative mx-auto aspect-square w-full max-w-3xl cursor-crosshair overflow-hidden rounded-2xl bg-black shadow-lg ring-2 ring-slate-900/10" onClick={handleTrainClick}>
                        <img src={activeCase.imageUrl} alt={activeCase.title} className="h-full w-full object-contain select-none" draggable={false} />

                        {attempts.map((a, idx) => (
                          <div
                            key={idx}
                            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${a.correct ? 'border-emerald-400 bg-emerald-400/20' : 'border-red-400 bg-red-400/20'}`}
                            style={{ left: `${a.x}%`, top: `${a.y}%`, width: '26px', height: '26px' }}
                          />
                        ))}

                        {showAnswer && (
                          <>
                            <div
                              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-emerald-400 bg-emerald-400/15"
                              style={{
                                left: `${activeCase.lesion.x}%`,
                                top: `${activeCase.lesion.y}%`,
                                width: `${activeCase.lesion.r * 4}px`,
                                height: `${activeCase.lesion.r * 4}px`,
                              }}
                            />
                            <div
                              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400"
                              style={{ left: `${activeCase.lesion.x}%`, top: `${activeCase.lesion.y}%`, width: '8px', height: '8px' }}
                            />
                            {activeCase.lesion.label ? (
                              <div
                                className="pointer-events-none absolute -translate-x-1/2 rounded-full bg-black/70 px-2 py-1 text-xs font-medium text-white"
                                style={{ left: `${activeCase.lesion.x}%`, top: `calc(${activeCase.lesion.y}% + 14px)` }}
                              >
                                {activeCase.lesion.label}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                        <Button type="button" className="rounded-xl shadow-sm" onClick={() => setShowAnswer((v) => !v)}>
                          {showAnswer ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                          {showAnswer ? 'ซ่อนเฉลยบนภาพ' : 'แสดงเฉลยบนภาพ'}
                        </Button>
                        <Button type="button" variant="outline" className="rounded-xl border-slate-300 bg-white shadow-sm" onClick={() => { setAttempts([]); setAnswered(false); setShowAnswer(false); }}>
                          <RotateCcw className="mr-2 h-4 w-4" /> เริ่มใหม่
                        </Button>
                        <Button type="button" variant="outline" className="rounded-xl border-slate-300 bg-white shadow-sm" onClick={() => setLearnerTab('read')}>
                          กลับไปอ่านเคส
                        </Button>
                      </div>
                    </>
                  ) : (
                    <Alert className="rounded-2xl"><AlertDescription>ไม่มีเคส</AlertDescription></Alert>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
                <CardHeader className="border-b border-slate-100 pb-4">
                  <CardTitle className="text-lg font-semibold text-slate-800">คำแนะนำ</CardTitle>
                  <CardDescription className="text-slate-600">หลังลองคลิกแล้วอ่านสรุปด้านล่าง</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  {!attempts.length ? (
                    <Alert className="rounded-2xl">
                      <AlertDescription>คลิกบนภาพ CT ตรงตำแหน่งที่คิดว่าเป็น lesion ตามคำถาม</AlertDescription>
                    </Alert>
                  ) : answered ? (
                    <Alert className="rounded-2xl border-emerald-300 bg-emerald-50/50">
                      <AlertDescription>
                        <div className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <div>
                            <div className="font-semibold">ถูกต้อง</div>
                            <div className="text-sm text-slate-700">ตรงกับจุดที่อาจารย์กำหนด</div>
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="rounded-2xl border-red-200 bg-red-50/40">
                      <AlertDescription>
                        <div className="flex gap-2">
                          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                          <div>
                            <div className="font-semibold">ยังไม่ตรงจุด</div>
                            <div className="text-sm text-slate-700">ลองดูความหนาแน่น (density) และรูปแบบอีกครั้ง หรือกดแสดงเฉลย</div>
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {activeCase && (
                    <div className="space-y-3 rounded-2xl border border-slate-100 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-inner">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">สรุป</div>
                        <div className="mt-1 text-sm leading-relaxed text-slate-800">{activeCase.teachingPoint || '—'}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activeCase.tags.map((t) => <Badge key={t} variant="secondary" className="rounded-full border border-slate-200/80 bg-white">{t}</Badge>)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {cropModalOpen && cropSrc ? (
        <div
          className="fixed inset-0 z-50 flex bg-black/75 p-0 sm:p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-modal-title"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeCropModal(); }}
        >
          <Card
            className="flex h-full w-full max-h-full flex-col overflow-hidden rounded-none border-0 shadow-2xl sm:max-h-[calc(100dvh-1.5rem)] sm:rounded-2xl sm:border sm:border-slate-200"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CardHeader className="shrink-0 space-y-2 border-b border-slate-100 py-3 sm:py-4">
              <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                <div className="min-w-0 flex-1">
                  <CardTitle id="crop-modal-title" className="text-lg sm:text-xl">
                    ตัดภาพ CT
                  </CardTitle>
                  {!cropHelpOpen ? (
                    <p className="mt-1 text-sm text-slate-600">
                      ลากกรอบบนภาพ → กด <strong>ใช้รูปที่ตัดแล้ว</strong> ด้านล่าง
                      {'. '}
                      รูปแพนอรามา/กว้างมาก — <strong>เลื่อนแนวนอน</strong> ในพื้นที่สีดำเพื่อเห็นส่วนที่เหลือ
                    </p>
                  ) : (
                    <CardDescription className="mt-1">
                      เลือกเฉพาะส่วนที่ต้องการสอนด้วยกรอบบนภาพ (ไม่มีวาด/หมุน) — หลังตัดแล้วคลิกวางจุด lesion ในพรีวิวใหม่
                    </CardDescription>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl border-slate-300"
                  onClick={() => setCropHelpOpen((v) => !v)}
                >
                  {cropHelpOpen ? 'ย่อคำแนะนำ' : 'แสดงวิธีใช้'}
                </Button>
              </div>
              {cropHelpOpen ? (
                <div className="rounded-xl border border-cyan-100/80 bg-cyan-50/40 p-3 text-sm text-slate-700 sm:p-4">
                  <p className="mb-2 font-medium text-slate-900">วิธีใช้</p>
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>รอให้ภาพแสดงในกล่องสีดำ</li>
                    <li>ลาก <strong>มุมหรือขอบ</strong> กรอบให้ครอบพื้นที่ที่ต้องการ</li>
                    <li>ลากกลางกรอบเพื่อ <strong>เลื่อน</strong> ทั้งกรอบ</li>
                    <li>กดปุ่ม <strong>ใช้รูปที่ตัดแล้ว</strong> ที่แถบล่าง</li>
                  </ol>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-3 pt-2 sm:p-5 sm:pt-3">
              <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-black">
                <div className="flex min-h-[min(50dvh,320px)] w-max min-w-full items-center justify-center p-2 sm:min-h-[min(60dvh,400px)] sm:p-3">
                  <div className="ct-crop-stage rounded-lg bg-black p-1 sm:rounded-xl sm:p-2">
                    <ReactCrop
                      crop={crop}
                      onChange={(pixelCrop, percentCrop) => {
                        setCrop(percentCrop);
                        setCompletedCrop(pixelCrop);
                      }}
                      onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
                      ruleOfThirds
                      minWidth={16}
                      minHeight={16}
                    >
                      <img
                        key={cropSessionKey}
                        ref={cropImgRef}
                        src={cropSrc}
                        alt="เลือกบริเวณตัด"
                        className="block h-auto max-h-[min(82dvh,960px)] w-auto max-w-none"
                        crossOrigin={cropSrc.startsWith('data:') ? undefined : 'anonymous'}
                        onLoad={onCropImageLoad}
                      />
                    </ReactCrop>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex shrink-0 flex-wrap gap-2 border-t border-slate-200 bg-slate-50/90 pt-3 sm:mt-4 sm:gap-3 sm:pt-4">
                <Button type="button" className="rounded-xl px-5 shadow-sm sm:px-6" onClick={applyImageCrop}>
                  ใช้รูปที่ตัดแล้ว
                </Button>
                <Button type="button" variant="outline" className="rounded-xl border-slate-300 bg-white shadow-sm" onClick={closeCropModal}>
                  ยกเลิก
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {loginOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-login-title"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setLoginOpen(false); }}
        >
          <Card className="w-full max-w-md rounded-3xl shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle id="admin-login-title">เข้าสู่ระบบผู้ดูแล</CardTitle>
              <CardDescription>
                {useCloudCases
                  ? 'โหมดคลาวด์: ใส่รหัสผ่านให้ตรงกับ ADMIN_WEB_PASSWORD บนเซิร์ฟเวอร์ (ค่าเริ่มต้น neuro)'
                  : 'สำหรับอาจารย์ที่สร้างและแก้ไขเคสเท่านั้น — ใส่รหัสผ่านเท่านั้น'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={tryLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="adm-pass">รหัสผ่านผู้ดูแล</Label>
                  <Input id="adm-pass" type="password" autoComplete="current-password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="neuro" />
                </div>
                {loginError ? <p className="text-sm text-red-600">{loginError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="rounded-xl">เข้าสู่ระบบ</Button>
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setLoginOpen(false)}>ยกเลิก</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

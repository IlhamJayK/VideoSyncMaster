import React, { useEffect, useState } from 'react';

interface ModelStatus {
    whisperx: boolean;
    alignment: boolean;
    index_tts: boolean;
    qwen_tokenizer: boolean;
    qwen_17b_base: boolean;
    qwen_17b_design: boolean;
    qwen_17b_custom: boolean;
    qwen_06b_base: boolean;
    qwen_06b_custom: boolean;
    rife: boolean;
}

interface ModelManagerProps {
    themeMode?: 'light' | 'dark' | 'gradient';
}

const ModelManager: React.FC<ModelManagerProps> = ({ themeMode }) => {
    const [status, setStatus] = useState<ModelStatus | null>(null);
    const [modelsRoot, setModelsRoot] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const isLightMode = themeMode === 'gradient' || themeMode === 'light';

    const checkStatus = async () => {
        setLoading(true);
        try {
            const result = await (window as any).ipcRenderer.invoke('check-model-status');
            if (result.success) {
                setStatus(result.status);
                setModelsRoot(result.root);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkStatus();
    }, []);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<string>('');

    const handleDownload = async (modelKey: string) => {
        if (downloading) return;
        setDownloading(modelKey);
        setDownloadProgress('正在准备下载...');

        try {
            // Determine model details based on key
            let modelId = '';
            let localDir = '';
            let isGenericFile = false;
            let downloadUrl = '';

            if (modelKey === 'index_tts') {
                modelId = 'Tiandong/Index-TTS';
                localDir = 'models/index-tts';
            } else if (modelKey === 'whisperx') {
                modelId = 'Tiandong/faster-whisper-large-v3-turbo-ct2';
                localDir = 'models/faster-whisper-large-v3-turbo-ct2';
            } else if (modelKey === 'alignment') {
                modelId = 'Tiandong/alignment';
                localDir = 'models/alignment';
            } else if (modelKey === 'qwen') {
                modelId = 'Qwen/Qwen2.5-7B-Instruct';
                localDir = 'models/Qwen2.5-7B-Instruct';
            } else if (modelKey === 'qwen_tokenizer') {
                modelId = 'Qwen/Qwen3-TTS-Tokenizer-12Hz';
                localDir = 'models/Qwen3-TTS-Tokenizer-12Hz';
            } else if (modelKey === 'qwen_17b_base') {
                modelId = 'Qwen/Qwen3-TTS-12Hz-1.7B-Base';
                localDir = 'models/Qwen3-TTS-12Hz-1.7B-Base';
            } else if (modelKey === 'qwen_17b_design') {
                modelId = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign';
                localDir = 'models/Qwen3-TTS-12Hz-1.7B-VoiceDesign';
            } else if (modelKey === 'qwen_17b_custom') {
                modelId = 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice';
                localDir = 'models/Qwen3-TTS-12Hz-1.7B-CustomVoice';
            } else if (modelKey === 'qwen_06b_base') {
                modelId = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base';
                localDir = 'models/Qwen3-TTS-12Hz-0.6B-Base';
            } else if (modelKey === 'qwen_06b_custom') {
                modelId = 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice';
                localDir = 'models/Qwen3-TTS-12Hz-0.6B-CustomVoice';
            } else if (modelKey === 'rife') {
                isGenericFile = true;
                modelId = 'rife-ncnn-vulkan';
                localDir = 'rife';
                downloadUrl = 'https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-windows.zip';
            }

            let result;
            if (isGenericFile) {
                result = await (window as any).ipcRenderer.invoke('download-file', {
                    key: modelKey,
                    url: downloadUrl,
                    targetDir: localDir,
                    name: modelId
                });
            } else {
                result = await (window as any).ipcRenderer.invoke('download-model', {
                    key: modelKey,
                    model: modelId,
                    localDir: localDir
                });
            }

            if (result.success) {
                alert('模型下载完成！');
                checkStatus();
            } else {
                if (result.error !== 'Cancelled') {
                    alert(`下载失败: ${result.error}`);
                }
            }
        } catch (e: any) {
            console.error(e);
            alert(`下载请求出错: ${e.message}`);
        } finally {
            setDownloading(null);
            setDownloadProgress('');
        }
    };

    const handleCancel = async (modelKey: string) => {
        try {
            if (modelKey === 'rife') {
                await (window as any).ipcRenderer.invoke('cancel-file-download', { key: modelKey });
            } else {
                await (window as any).ipcRenderer.invoke('cancel-download', { key: modelKey });
            }
            setDownloadProgress('正在取消...');
        } catch (e) {
            console.error("Cancel failed", e);
        }
    };

    const models = [
        { key: 'whisperx', name: 'WhisperX', desc: '核心语音识别模型 (ASR)', link: 'Models/faster-whisper-large-v3-turbo-ct2' },
        { key: 'alignment', name: 'Forced Alignment', desc: '语音强制对齐模型 (Wav2Vec2)', link: 'Models/alignment' },
        { key: 'index_tts', name: 'Index-TTS', desc: 'Index-TTS 语音克隆模型', link: 'Models/index-tts' },

        { key: 'qwen', name: 'Qwen 2.5 7B', desc: 'Qwen 2.5 7B Instruct 模型', link: 'Models/Qwen2.5-7B-Instruct' },
        { key: 'qwen_tokenizer', name: 'Qwen3 Tokenizer', desc: 'Qwen3 分词器 (Tokenizer-12Hz)', link: 'Models/Qwen3-TTS-Tokenizer-12Hz' },

        { key: 'qwen_17b_base', name: 'Qwen3 1.7B Base', desc: 'Qwen3 声音克隆 (基础模型, 1.7B)', link: 'Models/Qwen3-TTS-12Hz-1.7B-Base' },


        { key: 'qwen_17b_design', name: 'Qwen3 1.7B Design', desc: 'Qwen3 声音设计 ', link: 'Models/Qwen3-TTS-12Hz-1.7B-VoiceDesign' },
        { key: 'qwen_17b_custom', name: 'Qwen3 1.7B Preset', desc: 'Qwen3 预置音色 ', link: 'Models/Qwen3-TTS-12Hz-1.7B-CustomVoice' },

        { key: 'qwen_06b_base', name: 'Qwen3 0.6B Base', desc: 'Qwen3 声音克隆 (轻量版, 0.6B)', link: 'Models/Qwen3-TTS-12Hz-0.6B-Base' },
        { key: 'qwen_06b_custom', name: 'Qwen3 0.6B Preset', desc: 'Qwen3 预置音色 (轻量版)', link: 'Models/Qwen3-TTS-12Hz-0.6B-CustomVoice' },

        { key: 'rife', name: 'RIFE Flow', desc: '光流法补帧模型 ', link: 'Models/rife' },
    ];

    return (
        <div style={{ padding: '20px', height: '100%', overflowY: 'auto', color: isLightMode ? '#333' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: isLightMode ? '#000' : '#fff' }}>📦 模型管理中心</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {downloading && <span style={{ fontSize: '0.9em', color: '#6366f1' }}>{downloadProgress}</span>}
                    <button onClick={checkStatus} disabled={!!downloading} style={{
                        padding: '8px 16px',
                        cursor: !!downloading ? 'not-allowed' : 'pointer',
                        background: isLightMode ? '#fff' : 'rgba(255,255,255,0.1)',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                        color: isLightMode ? '#333' : '#fff',
                        opacity: !!downloading ? 0.6 : 1
                    }}>🔄 刷新状态</button>
                </div>
            </div>

            <div style={{
                marginBottom: '20px',
                padding: '10px',
                background: isLightMode ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '0.9em',
                color: isLightMode ? '#333' : '#ddd'
            }}>
                <strong>模型根目录:</strong> {modelsRoot || '正在检测...'}
                <div style={{ marginTop: '5px', color: isLightMode ? '#666' : '#aaa' }}>请将所有模型文件夹放入此目录中。</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {models.map((m) => {
                    const isInstalled = status ? (status as any)[m.key] : false;
                    const isDownloadingThis = downloading === m.key;

                    return (
                        <div key={m.key} style={{
                            border: '1px solid',
                            borderRadius: '8px',
                            padding: '15px',
                            background: isInstalled
                                ? (isLightMode ? 'rgba(76, 175, 80, 0.1)' : 'rgba(76, 175, 80, 0.2)')
                                : (isLightMode ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.2)'),
                            borderColor: isInstalled ? '#4caf50' : '#f44336',
                            position: 'relative'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0, color: isLightMode ? '#000' : '#fff' }}>{m.name}</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        background: isInstalled ? '#4caf50' : '#f44336',
                                        color: '#fff',
                                        fontSize: '0.8em',
                                        fontWeight: 'bold'
                                    }}>
                                        {loading ? '...' : (isInstalled ? '已安装' : '未安装')}
                                    </span>
                                </div>
                            </div>
                            <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: isLightMode ? '#555' : '#ccc' }}>{m.desc}</p>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
                                <div style={{ fontSize: '0.8em', color: isLightMode ? '#888' : '#999', wordBreak: 'break-all' }}>
                                    路径: models/{m.link.split('/')[1]}
                                </div>

                                {/* Download Button for Index-TTS & WhisperX & Alignment & Qwen & RIFE */}
                                {(m.key === 'index_tts' || m.key === 'whisperx' || m.key === 'alignment' || m.key.startsWith('qwen') || m.key === 'rife') && !isInstalled && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                        {isDownloadingThis ? (
                                            <>
                                                <div style={{ fontSize: '0.8em', color: '#2196f3' }}>
                                                    {downloadProgress || '下载中...'}
                                                </div>
                                                <button
                                                    onClick={() => handleCancel(m.key)}
                                                    style={{
                                                        padding: '6px 12px',
                                                        borderRadius: '4px',
                                                        border: 'none',
                                                        background: '#f44336',
                                                        color: '#fff',
                                                        cursor: 'pointer',
                                                        fontSize: '0.85em'
                                                    }}
                                                >
                                                    停止下载
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleDownload(m.key)}
                                                disabled={!!downloading}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '4px',
                                                    border: 'none',
                                                    background: '#6366f1',
                                                    color: '#fff',
                                                    cursor: !!downloading ? 'not-allowed' : 'pointer',
                                                    fontSize: '0.85em',
                                                    opacity: !!downloading ? 0.5 : 1
                                                }}
                                            >
                                                ⬇ 下载模型
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ModelManager;

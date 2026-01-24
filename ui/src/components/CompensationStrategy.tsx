import React, { useState, useEffect } from 'react';
import ConfirmDialog from './ConfirmDialog';

interface CompensationStrategyProps {
    themeMode?: 'light' | 'dark' | 'gradient';
}

const CompensationStrategy: React.FC<CompensationStrategyProps> = ({ themeMode }) => {
    const isLightMode = themeMode === 'gradient' || themeMode === 'light';
    const [strategy, setStrategy] = useState<string>('auto_speedup');
    const [hasRife, setHasRife] = useState<boolean>(false);
    const [showSaveConfirm, setShowSaveConfirm] = useState(false);

    // Initial check for RIFE availability
    useEffect(() => {
        const checkRife = async () => {
            // We can check via IPC if model exists, reuse logic or cache
            // For now assume true or check again
            try {
                const result = await (window as any).ipcRenderer.invoke('check-model-status');
                if (result && result.status && result.status.rife) {
                    setHasRife(true);
                }
            } catch (e) {
                console.error(e);
            }
        };
        checkRife();

        const stored = localStorage.getItem('compensation_strategy');
        if (stored) setStrategy(stored);
    }, []);

    const handleSave = () => {
        localStorage.setItem('compensation_strategy', strategy);
        // Dispatch event or just rely on localStorage read at generation time
        setShowSaveConfirm(true);
    };

    const strategies = [
        {
            id: 'auto_speedup',
            icon: '🏃',
            name: '自动加速 (Speed Up)',
            desc: '当语音时长超出视频片段时，自动加速语音以匹配视频时长。保持画面连贯，画音完全同步。',
            color: '#10b981' // Green
        },
        {
            id: 'freeze_frame',
            icon: '🛑',
            name: '画面冻结 (Freeze Frame)',
            desc: '语音不加速。在视频片段末尾冻结最后一帧画面，等待语音播放完毕。适用于语速较快或不希望语音变形的场景。',
            color: '#f59e0b' // Amber
        },
        {
            id: 'rife',
            icon: '🌊',
            name: '光流法补帧 (RIFE)',
            desc: '使用光流法生成慢动作视频。画面极致丝滑，但处理耗时较长。需安装 RIFE 模型。',
            color: '#6366f1', // Indigo
            disabled: !hasRife,
            disabledDesc: '未检测到 RIFE 模型，无法使用。请在模型管理中心下载。'
        },
        {
            id: 'frame_blend',
            icon: '🌫️',
            name: '帧融合补帧 (Frame Blending)',
            desc: '通过混合前后帧生成中间帧（淡入淡出）。比直接减速更流畅，计算速度极快，但动态画面会有轻微重影。',
            color: '#ec4899' // Pink
        }
    ];

    return (
        <div style={{ padding: '20px', height: '100%', overflowY: 'auto', color: isLightMode ? '#333' : '#fff' }}>
            <h2 style={{ marginBottom: '20px', color: isLightMode ? '#000' : '#fff' }}>🏃 慢放补偿策略</h2>
            <p style={{ marginBottom: '20px', fontSize: '0.9em', color: isLightMode ? '#666' : '#aaa' }}>
                当翻译后的语音时长长于原始视频片段时，系统需要采取措施来保证音画同步。请选择您偏好的策略：
            </p>

            <div style={{ display: 'grid', gap: '15px' }}>
                {strategies.map((s) => (
                    <div
                        key={s.id}
                        onClick={() => !s.disabled && setStrategy(s.id)}
                        style={{
                            border: `2px solid ${strategy === s.id ? s.color : (isLightMode ? '#ddd' : '#444')}`,
                            borderRadius: '8px',
                            padding: '15px',
                            background: strategy === s.id
                                ? (isLightMode ? `${s.color}20` : `${s.color}30`)
                                : (isLightMode ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.05)'),
                            cursor: s.disabled ? 'not-allowed' : 'pointer',
                            opacity: s.disabled ? 0.6 : 1,
                            position: 'relative',
                            transition: 'all 0.2s'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '1.5em', marginRight: '10px' }}>{s.icon}</span>
                            <span style={{ fontWeight: 'bold', fontSize: '1.1em', color: isLightMode ? '#000' : '#fff' }}>{s.name}</span>
                            {strategy === s.id && <span style={{ marginLeft: 'auto', color: s.color, fontWeight: 'bold' }}>✓ 当前选择</span>}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9em', lineHeight: '1.4', color: isLightMode ? '#555' : '#ccc' }}>
                            {s.disabled ? s.disabledDesc : s.desc}
                        </p>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '30px', textAlign: 'right' }}>
                <button
                    onClick={handleSave}
                    style={{
                        padding: '10px 24px',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                >
                    💾 保存策略配置
                </button>
            </div>

            <ConfirmDialog
                isOpen={showSaveConfirm}
                title="系统提示"
                message="策略配置已保存！将在下次生成时生效。"
                onConfirm={() => setShowSaveConfirm(false)}
                isLightMode={isLightMode}
                confirmText="确定"
                onCancel={undefined}
                confirmColor="#10b981"
            />
        </div>
    );
};

export default CompensationStrategy;

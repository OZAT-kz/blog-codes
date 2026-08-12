// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// React: Проверка статуса пользователя
import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged, getIdTokenResult } from 'firebase/auth';

export const useAdStrategy = () => {
    const [showAds, setShowAds] = useState<boolean | null>(null); // null = загрузка

    useEffect(() => {
        const auth = getAuth();
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Получаем claims. ForceRefresh = false для скорости!
                const tokenResult = await getIdTokenResult(user, false);
                const isWhale = tokenResult.claims.is_whale === true;
                setShowAds(!isWhale);
            } else {
                // Незалогиненным - показываем рекламу на всю катушку
                setShowAds(true);
            }
        });
        return () => unsubscribe();
    }, []);

    return showAds;
};

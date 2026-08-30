// ==============================================================================
// Paywall или AdSense? Как мы динамически скрывали рекламу от «китов» с помощью Firebase и Google Analytics
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/react-firebase-claims-provider.tsx
// ==============================================================================

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

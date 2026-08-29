// ==============================================================================
// ISO 3779 VIN Checksum and Character Cleaner for Vehicle Registration OCR
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vin-checksum-iso3779-validator.ts
// ==============================================================================

/**
 * Валидатор контрольной суммы VIN-номера по стандарту ISO 3779 / US DOT
 * Предотвращает ошибки оптического распознавания (путаница 0 и O, 1 и I)
 * Источник: OZAT Engineering Blog (https://ozat.kz)
 */
export function validateAndCleanVin(rawVin: string): { isValid: boolean; cleanedVin: string; error?: string } {
  // 1. Очистка от пробелов, дефисов и перевод в верхний регистр
  const cleanedVin = rawVin.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 2. Длина VIN обязана быть ровно 17 символов (для автомобилей с 1981 года)
  if (cleanedVin.length !== 17) {
    return { isValid: false, cleanedVin, error: `Неверная длина VIN (${cleanedVin.length} вместо 17)` };
  }

  // 3. Запрещенные символы в VIN: I (И), O (О), Q (Кью) — во избежание путаницы с 1 и 0
  if (/[IOQ]/.test(cleanedVin)) {
    return { isValid: false, cleanedVin, error: 'VIN не может содержать буквы I, O, Q' };
  }

  // 4. Таблица весовых коэффициентов позиций (1..17)
  const positionWeights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  // 5. Таблица численных значений буквенных символов
  const charValues: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
    '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
  };

  let weightedSum = 0;
  for (let i = 0; i < 17; i++) {
    const char = cleanedVin[i];
    const val = charValues[char];
    if (val === undefined) {
      return { isValid: false, cleanedVin, error: `Недопустимый символ ${char}` };
    }
    weightedSum += val * positionWeights[i];
  }

  // 6. Расчет контрольного знака (остаток от деления на 11)
  const remainder = weightedSum % 11;
  const expectedCheckDigit = remainder === 10 ? 'X' : remainder.toString();
  const actualCheckDigit = cleanedVin[8]; // 9-й символ (индекс 8) — контрольный знак

  // Для рынков Северной Америки и большинства мировых брендов проверка строгая
  const isChecksumValid = expectedCheckDigit === actualCheckDigit;

  return {
    isValid: isChecksumValid,
    cleanedVin,
    error: isChecksumValid ? undefined : `Ошибка контрольной суммы: ожидалось '${expectedCheckDigit}', получено '${actualCheckDigit}'`
  };
}

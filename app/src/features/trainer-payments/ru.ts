export const trainerPaymentsRu = {
  reverseTitle: 'Отменить оплату',
  reverseConfirm: 'Подтвердить отмену',
  reverseNotice:
    'Отменить оплату {{amount}}? Долг по пакету увеличится. Посещения и занятия не изменятся.',
  reverseReason: 'Причина отмены',
  reverseError: 'Не удалось отменить оплату. Повторите сохранённую команду.',
  title: 'Записать оплату',
  subtitle:
    '{{name}} · к оплате {{amount}}. Оплата уменьшает долг, но не количество посещений.',
  amount: 'Сумма, ₸',
  amountPlaceholder: '0',
  method: 'Способ',
  save: 'Записать оплату',
  cancel: 'Отмена',
  invalidAmount: 'Введите сумму больше нуля',
  overDebt: 'Больше долга по пакету ({{amount}})',
  invalidDate: 'Не удалось определить дату оплаты.',
  submitError: 'Не удалось записать оплату. Попробуйте ещё раз.',
  methodKaspi: 'Kaspi',
  methodTransfer: 'Перевод',
  methodCash: 'Наличные',
} as const;

export const relatedPages:Record<string,{page:string;text:string}[]>={
 personal:[{page:'calendar',text:'Сроки задач в общем календаре'},{page:'journal',text:'Доклады о выполненных работах'}],
 journal:[{page:'people',text:'Сотрудники и связанные табели'},{page:'stock',text:'Остатки и расход материалов'},{page:'calculations',text:'Прямые затраты по данным учёта'}],
 farm:[{page:'journal',text:'Фактические работы по объекту'},{page:'maintenance',text:'Наработка и обслуживание техники'},{page:'documents',text:'Инструкции и документы объекта'}],
 maintenance:[{page:'stock',text:'Материалы для обслуживания'},{page:'journal',text:'Подтверждённые работы'},{page:'documents',text:'Руководства и инструкции'}],
 people:[{page:'journal',text:'Работы, из которых создаются табели'},{page:'calculations',text:'Расчёт оплаты по учёту'}],
 documents:[{page:'assistant',text:'Поиск сведений для задачи'},{page:'maintenance',text:'Инструкции для обслуживания'}],
 calculations:[{page:'journal',text:'Проверка исходных работ'},{page:'reports',text:'Сводка и выгрузка в Excel'}],
 integrations:[{page:'people',text:'Сотрудники после применения пакета'},{page:'stock',text:'Номенклатура и текущие остатки'}],
 drafts:[{page:'personal',text:'Продолжить личные задачи'},{page:'journal',text:'Вернуться к докладам'}],
};

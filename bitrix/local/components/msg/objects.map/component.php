<?php
/**
 * Компонент msg:objects.map — выдаёт объекты инфоблока для интерактивной карты.
 * Кэшируется с тегом инфоблока: при изменении любого элемента кэш сбрасывается сам.
 */
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) die();

use Bitrix\Main\Loader;

if (!Loader::includeModule('iblock')) {
    ShowError('Модуль «Информационные блоки» не установлен');
    return;
}

$arParams['IBLOCK_ID'] = (int)$arParams['IBLOCK_ID'];
if ($arParams['IBLOCK_ID'] <= 0) {
    ShowError('Карта объектов: не указан ID инфоблока');
    return;
}
$def = [
    'PROP_MAP' => 'MAP', 'PROP_PRODUCT' => 'PRODUCT', 'PROP_INDUSTRY' => 'INDUSTRY', 'PROP_COUNTRY' => 'COUNTRY',
    'PROP_CITY' => 'CITY', 'PROP_REGION' => 'REGION', 'PROP_TASK' => 'TASK', 'PROP_SOLUTION' => 'SOLUTION',
    'PROP_PERIOD' => 'PERIOD', 'DEFAULT_COUNTRY' => 'Россия', 'ASSETS_PATH' => '/local/msg-map',
    'THEME' => 'dark', 'VIEW' => 'mercator', 'SHOW_LINK' => 'Y',
];
foreach ($def as $k => $v) {
    if (!isset($arParams[$k]) || $arParams[$k] === '') $arParams[$k] = $v;
}
$arParams['ASSETS_PATH'] = rtrim($arParams['ASSETS_PATH'], '/');
if (!isset($arParams['CACHE_TIME'])) $arParams['CACHE_TIME'] = 3600;

if ($this->startResultCache(false, [$arParams['IBLOCK_ID'], $arParams['SHOW_LINK']])) {
    \CIBlock::registerWithTagCache($arParams['IBLOCK_ID']);

    // значение свойства -> простой текст
    $val = function ($props, $code) {
        if ($code === '' || empty($props[$code])) return '';
        $v = $props[$code]['VALUE'];
        if (is_array($v)) {
            if (isset($v['TEXT'])) return trim(html_entity_decode(strip_tags($v['TEXT']), ENT_QUOTES, 'UTF-8'));
            return trim(implode(' / ', array_map(function ($x) {
                return trim(strip_tags((string)$x));
            }, array_filter($v))));
        }
        return trim(html_entity_decode(strip_tags((string)$v), ENT_QUOTES, 'UTF-8'));
    };

    $objects = [];
    $rs = \CIBlockElement::GetList(
        ['SORT' => 'ASC', 'ID' => 'ASC'],
        ['IBLOCK_ID' => $arParams['IBLOCK_ID'], 'ACTIVE' => 'Y', 'ACTIVE_DATE' => 'Y', 'CHECK_PERMISSIONS' => 'Y'],
        false,
        false,
        ['ID', 'IBLOCK_ID', 'NAME', 'SORT', 'PREVIEW_TEXT', 'PREVIEW_PICTURE', 'DETAIL_PICTURE', 'DETAIL_PAGE_URL']
    );
    while ($ob = $rs->GetNextElement()) {
        $f = $ob->GetFields();
        $p = $ob->GetProperties();

        // координаты: «широта,долгота»
        $ll = explode(',', $val($p, $arParams['PROP_MAP']));
        if (count($ll) < 2 || !is_numeric(trim($ll[0])) || !is_numeric(trim($ll[1]))) continue;   // без точки на карту не выводим
        $lat = (float)trim($ll[0]);
        $lon = (float)trim($ll[1]);

        $photo = null;
        $picId = (int)($f['PREVIEW_PICTURE'] ?: $f['DETAIL_PICTURE']);
        if ($picId > 0) {
            $r = \CFile::ResizeImageGet($picId, ['width' => 720, 'height' => 450], BX_RESIZE_IMAGE_PROPORTIONAL, false);
            $photo = $r['src'] ?? \CFile::GetPath($picId);
        }

        $task = $val($p, $arParams['PROP_TASK']);
        if ($task === '') $task = trim(strip_tags($f['PREVIEW_TEXT']));
        $country = $val($p, $arParams['PROP_COUNTRY']);

        $objects[] = [
            'id'       => (int)$f['ID'],
            'title'    => $f['NAME'],
            'city'     => $val($p, $arParams['PROP_CITY']),
            'region'   => $val($p, $arParams['PROP_REGION']),
            'country'  => $country !== '' ? $country : $arParams['DEFAULT_COUNTRY'],
            'lat'      => $lat,
            'lon'      => $lon,
            'product'  => $val($p, $arParams['PROP_PRODUCT']),
            'industry' => $val($p, $arParams['PROP_INDUSTRY']),
            'period'   => $val($p, $arParams['PROP_PERIOD']) ?: null,
            'description' => $task,
            'solution' => $val($p, $arParams['PROP_SOLUTION']),
            'photo'    => $photo,
            'url'      => $arParams['SHOW_LINK'] === 'Y' && !empty($f['DETAIL_PAGE_URL']) ? $f['DETAIL_PAGE_URL'] : null,
            'sort'     => (int)$f['SORT'],
            'active'   => true,
        ];
    }

    // сайт может быть не в UTF-8 — карте нужен UTF-8
    if (defined('LANG_CHARSET') && strtoupper(LANG_CHARSET) !== 'UTF-8') {
        $objects = \Bitrix\Main\Text\Encoding::convertEncoding($objects, LANG_CHARSET, 'UTF-8');
    }

    $arResult['COUNT'] = count($objects);
    // HEX-флаги: безопасно вставлять внутрь <script type="application/json">
    $arResult['JSON'] = json_encode(['objects' => $objects], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);

    $this->includeComponentTemplate();
}

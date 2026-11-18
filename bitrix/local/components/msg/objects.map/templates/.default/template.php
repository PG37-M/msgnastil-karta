<?php
if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true) die();
/** @var array $arParams */
/** @var array $arResult */
/** @var CBitrixComponentTemplate $this */

if (empty($arResult['COUNT'])) return;

$base = $arParams['ASSETS_PATH'];
$this->addExternalCss($base . '/assets/msg-map.css');
$this->addExternalJs($base . '/assets/msg-map.js');
$uid = 'msg-map-data-' . $arParams['IBLOCK_ID'];
?>
<div class="msgmap"
     data-msgmap
     data-projection="<?= htmlspecialcharsbx($arParams['VIEW']) ?>"
     data-theme="<?= htmlspecialcharsbx($arParams['THEME']) ?>"
     data-src="#<?= $uid ?>"
     data-countries="<?= $base ?>/data/countries.json"
     data-vendor="<?= $base ?>/vendor/"
     data-relief-tiles="<?= $base ?>/data/relief/{z}/{x}/{y}.webp"></div>
<script type="application/json" id="<?= $uid ?>"><?= $arResult['JSON'] ?></script>

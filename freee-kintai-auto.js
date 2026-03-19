/**
 * ================================================================
 * freee勤怠管理Plus 打刻自動入力スクリプト
 * ================================================================
 *
 * 【使い方】
 * 1. freee勤怠管理Plusのタイムカードページ（月次一覧）をブラウザで開く
 * 2. Chrome DevTools を開く（F12 または Ctrl+Shift+I）
 * 3. Console タブに移動
 * 4. このスクリプト全体をコピー＆ペーストして Enter
 * 5. まずドライラン結果が表示される → 内容を確認
 * 6. 問題なければ、スクリプト冒頭の dryRun を false に変更して再実行
 *
 * 【対象】
 * - スケジュールが「裁量労働（深夜なし）」の日
 * - かつ打刻が未入力（specific-uncomplete）の日のみ
 *
 * 【設定変更】
 * 下記の CONFIG で出勤・退勤時間の範囲を調整できます
 */

(async function freeeKintaiAuto() {
  'use strict';

  // ============================================================
  // ★ 設定（ここを変更してカスタマイズ）
  // ============================================================
  const CONFIG = {
    // --- 出勤時間の範囲 ---
    // 9:00 〜 9:45 の間でランダム
    clockInStartMinutes: 9 * 60 + 0,   // 9:00 を分に変換 = 540
    clockInEndMinutes:   9 * 60 + 45,   // 9:45 を分に変換 = 585

    // --- 退勤時間の範囲 ---
    // 19:30 〜 20:00 の間でランダム
    clockOutStartMinutes: 19 * 60 + 30, // 19:30 を分に変換 = 1170
    clockOutEndMinutes:   20 * 60 + 0,  // 20:00 を分に変換 = 1200

    // --- 対象スケジュール名 ---
    targetSchedule: '裁量労働（深夜なし）',

    // --- スキップするキーワード（有給・休暇など） ---
    // スケジュール欄や行内にこれらの文字が含まれる日はスキップ
    skipKeywords: ['有給', '有休', '休暇', '欠勤', '特別休', '代休', '振替'],

    // --- リクエスト間の待機時間（ミリ秒） ---
    delayBetweenRequests: 1500,

    // --- ドライランモード ---
    // true  = 実際には送信しない（確認のみ）
    // false = 実際に打刻申請を送信する
    dryRun: true,

    // --- 未来日を除外するか ---
    // true = 今日より後の日はスキップ（月中実行時の安全策）
    skipFutureDates: true
  };

  // ============================================================
  // ユーティリティ関数
  // ============================================================

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateRandomTime(startMinutes, endMinutes) {
    const totalMinutes = randomInt(startMinutes, endMinutes);
    return {
      hour: Math.floor(totalMinutes / 60),
      minute: totalMinutes % 60
    };
  }

  function formatHHMM(hour, minute) {
    return String(hour).padStart(2, '0') + String(minute).padStart(2, '0');
  }

  function formatTime(hour, minute) {
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // メイン処理
  // ============================================================

  console.log('%c freee勤怠管理Plus 打刻自動入力 ', 'background: #2196F3; color: white; font-size: 14px; padding: 4px 8px;');
  console.log('');

  // --------------------------------------------------
  // Step 1: 対象行を収集
  // --------------------------------------------------
  console.log('📋 Step 1: 対象日を検索中...');

  const schedCells = document.querySelectorAll(
    'td.schedule.specific-timecard_schedule.specific-uncomplete'
  );

  if (schedCells.length === 0) {
    // uncomplete がない場合、ページが正しいか確認
    const allSched = document.querySelectorAll('td.schedule.specific-timecard_schedule');
    if (allSched.length === 0) {
      console.error('❌ タイムカードのテーブルが見つかりません。タイムカードページ（月次一覧）で実行してください。');
      return;
    }
    console.log('✅ 未入力の対象日はありません。全日入力済みです！');
    return;
  }

  const targetDays = [];

  const skippedDays = [];

  for (const td of schedCells) {
    if (!td.textContent.includes(CONFIG.targetSchedule)) continue;

    const row = td.closest('tr');
    if (!row) continue;

    const dateCell = row.querySelector('td.htBlock-scrollTable_day');
    const dateText = dateCell ? dateCell.textContent.trim() : '不明';

    // 未来日スキップ
    if (CONFIG.skipFutureDates) {
      const match = dateText.match(/(\d{2})\/(\d{2})/);
      if (match) {
        const now = new Date();
        const targetDate = new Date(now.getFullYear(), parseInt(match[1], 10) - 1, parseInt(match[2], 10));
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (targetDate > today) {
          skippedDays.push({ dateText, reason: '未来日' });
          continue;
        }
      }
    }

    // 有給・休暇などのキーワードが行内に含まれていたらスキップ
    const rowText = row.textContent;
    const matchedKeyword = CONFIG.skipKeywords.find(kw => rowText.includes(kw));
    if (matchedKeyword) {
      skippedDays.push({ dateText, reason: matchedKeyword });
      continue;
    }

    const actionCell = row.querySelector('td.htBlock-adjastableTableF_actionRow');
    if (!actionCell) continue;

    // 打刻申請のフォームを探す（最初のフォーム）
    const form = actionCell.querySelector('form');
    if (!form) continue;

    const btn = form.querySelector('button');
    if (!btn || !btn.textContent.includes('打刻申請')) continue;

    targetDays.push({
      dateText,
      form,
      formAction: form.getAttribute('action')
    });
  }

  // スキップした日を表示
  if (skippedDays.length > 0) {
    console.log(`\n⏭️  ${skippedDays.length} 日スキップ（有給・休暇等）:`);
    for (const s of skippedDays) {
      console.log(`   ${s.dateText} → 「${s.reason}」を含むためスキップ`);
    }
  }

  if (targetDays.length === 0) {
    console.log('✅ 「' + CONFIG.targetSchedule + '」の未入力日はありません。');
    return;
  }

  // --------------------------------------------------
  // Step 2: ランダム時間を生成して表示
  // --------------------------------------------------
  const plan = targetDays.map(day => {
    const ci = generateRandomTime(CONFIG.clockInStartMinutes, CONFIG.clockInEndMinutes);
    const co = generateRandomTime(CONFIG.clockOutStartMinutes, CONFIG.clockOutEndMinutes);
    return {
      ...day,
      clockIn: ci,
      clockOut: co,
      clockInStr: formatHHMM(ci.hour, ci.minute),
      clockOutStr: formatHHMM(co.hour, co.minute)
    };
  });

  console.log(`\n📌 ${plan.length} 日分の未入力日が見つかりました:\n`);
  console.log('┌────────────────┬────────┬────────┐');
  console.log('│ 日付           │ 出勤   │ 退勤   │');
  console.log('├────────────────┼────────┼────────┤');
  for (const p of plan) {
    const d = p.dateText.padEnd(14);
    const ci = formatTime(p.clockIn.hour, p.clockIn.minute);
    const co = formatTime(p.clockOut.hour, p.clockOut.minute);
    console.log(`│ ${d} │ ${ci}  │ ${co}  │`);
  }
  console.log('└────────────────┴────────┴────────┘');

  // --------------------------------------------------
  // ドライラン判定
  // --------------------------------------------------
  if (CONFIG.dryRun) {
    console.log('\n%c ⚠️  ドライランモード（実際の送信は行いません） ', 'background: #FF9800; color: white; padding: 2px 8px;');
    console.log('');
    console.log('👉 実際に送信するには:');
    console.log('   1. スクリプト内の dryRun: true を dryRun: false に変更');
    console.log('   2. 再度スクリプトを貼り付けて実行');
    return { plan, config: CONFIG };
  }

  // --------------------------------------------------
  // Step 3: 打刻申請を送信
  // --------------------------------------------------
  console.log('\n%c 🚀 打刻申請を送信中... ', 'background: #4CAF50; color: white; padding: 2px 8px;');

  const results = [];

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const progress = `[${i + 1}/${plan.length}]`;
    console.log(`\n  ${progress} ${p.dateText} を処理中...`);

    try {
      // Step 3a: 勤務データ編集ページを取得
      const navFormData = new FormData(p.form);
      navFormData.set('action_id', '2');

      const editPageResponse = await fetch(p.formAction, {
        method: 'POST',
        body: navFormData
      });

      if (!editPageResponse.ok) {
        throw new Error(`編集ページ取得失敗 (HTTP ${editPageResponse.status})`);
      }

      const editHtml = await editPageResponse.text();
      const editDoc = new DOMParser().parseFromString(editHtml, 'text/html');

      // Step 3b: 編集フォームを取得
      const editForm = editDoc.getElementById('working_edit_form');
      if (!editForm) {
        throw new Error('編集フォーム (working_edit_form) が見つかりません');
      }

      // Step 3c: FormData を構築
      const submitFormData = new FormData(editForm);
      submitFormData.set('action_id', '1');

      // 出勤（行1）
      submitFormData.set('recording_type_code_1', '1');
      submitFormData.set('recording_timestamp_hour_1', String(p.clockIn.hour));
      submitFormData.set('recording_timestamp_minute_1', String(p.clockIn.minute).padStart(2, '0'));
      submitFormData.set('recording_timestamp_time_1', p.clockInStr);

      // 退勤（行2）
      submitFormData.set('recording_type_code_2', '2');
      submitFormData.set('recording_timestamp_hour_2', String(p.clockOut.hour));
      submitFormData.set('recording_timestamp_minute_2', String(p.clockOut.minute).padStart(2, '0'));
      submitFormData.set('recording_timestamp_time_2', p.clockOutStr);

      // Step 3d: 送信
      const editAction = editForm.getAttribute('action');
      const submitResponse = await fetch(editAction, {
        method: 'POST',
        body: submitFormData
      });

      if (!submitResponse.ok) {
        throw new Error(`打刻申請送信失敗 (HTTP ${submitResponse.status})`);
      }

      // レスポンスのエラーチェック
      const resultHtml = await submitResponse.text();
      const resultDoc = new DOMParser().parseFromString(resultHtml, 'text/html');
      const errorMsg = resultDoc.querySelector('.htBlock-alertBox_error, .error-message');

      if (errorMsg) {
        const errorText = errorMsg.textContent.trim();
        console.log(`  ⚠️  ${p.dateText}: 送信完了（警告: ${errorText}）`);
        results.push({ date: p.dateText, status: 'warning', clockIn: p.clockInStr, clockOut: p.clockOutStr, message: errorText });
      } else {
        console.log(`  ✅ ${p.dateText}: 出勤 ${formatTime(p.clockIn.hour, p.clockIn.minute)} / 退勤 ${formatTime(p.clockOut.hour, p.clockOut.minute)}`);
        results.push({ date: p.dateText, status: 'success', clockIn: p.clockInStr, clockOut: p.clockOutStr });
      }

    } catch (error) {
      console.error(`  ❌ ${p.dateText}: ${error.message}`);
      results.push({ date: p.dateText, status: 'error', error: error.message });
    }

    // リクエスト間の待機
    if (i < plan.length - 1) {
      await sleep(CONFIG.delayBetweenRequests);
    }
  }

  // --------------------------------------------------
  // Step 4: 結果サマリー
  // --------------------------------------------------
  const success = results.filter(r => r.status === 'success').length;
  const warning = results.filter(r => r.status === 'warning').length;
  const errors  = results.filter(r => r.status === 'error').length;

  console.log('\n' + '═'.repeat(50));
  console.log('%c 📊 結果サマリー ', 'background: #2196F3; color: white; padding: 2px 8px;');
  console.log('═'.repeat(50));
  console.log(`  ✅ 成功: ${success} 件`);
  if (warning > 0) console.log(`  ⚠️  警告: ${warning} 件`);
  if (errors > 0)  console.log(`  ❌ エラー: ${errors} 件`);
  console.log(`  📊 合計: ${results.length} 件`);

  if (errors > 0) {
    console.log('\n❌ エラーの詳細:');
    for (const r of results.filter(r => r.status === 'error')) {
      console.log(`  ${r.date}: ${r.error}`);
    }
  }

  console.log('\n💡 ページをリロード（F5）して結果を確認してください。');
  console.log('');

  return results;
})();

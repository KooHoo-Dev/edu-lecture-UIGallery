// 숫자 → 글자 버퍼 (할당 없음).
// value.ToString("N0") 처럼 매번 새 문자열을 만들지 않고, 미리 만든 char[] 에 직접 써서
// TMP_Text.SetCharArray(buffer, 0, length) 로 넘긴다. 천 단위 쉼표 · K/M 축약 · '+' · '×N' 포함.

namespace UIGallery.DamageNumbers
{
    public static class DamageNumberText
    {
        /// <returns>쓴 글자 수</returns>
        public static int Write(char[] buf, long value, DamageNumberFormat format, bool plus, int hits)
        {
            int n = 0;
            if (plus) buf[n++] = '+';
            if (value < 0) value = 0;

            if (format == DamageNumberFormat.Short && value >= 1000)
            {
                // 1 자리 소수: 3912 → 3.9K, 1250000 → 1.3M
                bool mega = value >= 1_000_000;
                long unit = mega ? 1_000_000 : 1000;
                long tenths = (value * 10 + unit / 2) / unit;
                n = WriteDigits(buf, n, tenths / 10, false);
                buf[n++] = '.';
                buf[n++] = (char)('0' + tenths % 10);
                buf[n++] = mega ? 'M' : 'K';
            }
            else
            {
                n = WriteDigits(buf, n, value, format == DamageNumberFormat.Grouped);
            }

            if (hits > 1)
            {
                buf[n++] = ' ';
                buf[n++] = '×';
                n = WriteDigits(buf, n, hits, false);
            }
            return n;
        }

        static int WriteDigits(char[] buf, int start, long v, bool group)
        {
            // 뒤에서부터 채운 뒤 뒤집는다
            int n = start;
            int count = 0;
            do
            {
                if (group && count > 0 && count % 3 == 0) buf[n++] = ',';
                buf[n++] = (char)('0' + v % 10);
                v /= 10;
                count++;
            } while (v > 0);
            for (int i = start, j = n - 1; i < j; i++, j--)
                (buf[i], buf[j]) = (buf[j], buf[i]);
            return n;
        }
    }
}

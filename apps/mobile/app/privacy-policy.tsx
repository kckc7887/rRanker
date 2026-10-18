import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '@/theme/app-theme';

const PRIVACY_POLICY = [
  { kind: 'title', text: '隐私政策' },
  { kind: 'date', text: '最后更新日期：2026 年 10 月 18 日' },
  { kind: 'date', text: '生效日期：2026 年 10 月 18 日' },
  { kind: 'paragraph', text: '欢迎使用 rRanker。' },
  { kind: 'paragraph', text: 'rRanker 是一款独立开发的多音游数据查询与管理应用，支持在 iOS 和 Android 设备上查看、整理和分析多个音乐游戏的玩家成绩及相关数据。' },
  { kind: 'paragraph', text: '我们重视用户的个人信息与隐私保护。本隐私政策旨在说明 rRanker 如何获取、使用、存储、共享和保护与你有关的信息，以及你如何管理这些信息。' },
  { kind: 'paragraph', text: '请在使用本应用前阅读本政策，尤其是涉及第三方账号授权、登录凭据、成绩同步、设备权限和位置信息的内容。' },
  { kind: 'heading', text: '适用范围' },
  { kind: 'paragraph', text: '本政策适用于 rRanker 移动应用（iOS、Android）以及官方网站 https://rranker.com/。' },
  { kind: 'paragraph', text: 'rRanker 目前支持舞萌 DX、中二节奏、Phigros、Phira、osu!、喵斯快跑、冰与火之舞、Majdata Net 和 Rizline。' },
  { kind: 'paragraph', text: 'rRanker 为独立第三方项目，与上述游戏的官方开发商、发行商及其关联企业不存在隶属或官方合作关系。' },
  { kind: 'paragraph', text: '本应用主要在用户设备上存储与处理数据。除提供资源分发等必要网络服务外，当前版本不设立用于集中保存全部玩家账号和游戏成绩的 rRanker 云端账户数据库。' },
  { kind: 'paragraph', text: '但这并不意味着所有信息始终仅保留在本地。当你使用第三方登录、在线查询、数据同步、地图等功能时，相关信息可能被传输至提供这些功能的第三方服务。' },
  { kind: 'heading', text: '我们获取和处理的信息' },
  { kind: 'subheading', text: '游戏账号与成绩' },
  { kind: 'paragraph', text: '当你主动绑定游戏账号、进行玩家查询或使用成绩相关功能时，rRanker 可能根据所选游戏及数据来源获取和处理以下信息：' },
  { kind: 'paragraph', text: '• 游戏玩家 ID、用户名、昵称、头像及账号标识；\n• 游戏成绩、游玩记录、Rating、RKS、PP、排名及相关统计信息；\n• 游戏收藏品、玩家成就、个人资料以及相关公开或经授权的数据；\n• 用于保持第三方登录状态的授权令牌、会话信息及其他必要凭据。' },
  { kind: 'paragraph', text: '这些信息用于展示玩家资料、查询成绩、计算游戏指标、分析实力、生成成绩图片及实现其他与游戏数据有关的功能。' },
  { kind: 'paragraph', text: '部分功能可以直接使用公开玩家信息，无需登录。需要访问非公开数据的功能，则可能要求你完成相应第三方平台的授权或身份验证。' },
  { kind: 'subheading', text: '登录与授权凭据' },
  { kind: 'paragraph', text: '根据不同的数据来源，rRanker 可能使用 OAuth 授权、设备授权、用户名与密码、手机号码与短信验证码、会话 Cookie、好友码或玩家二维码等方式访问第三方游戏服务。' },
  { kind: 'paragraph', text: '登录信息仅用于完成你请求的身份验证、维护会话及获取授权范围内的数据。' },
  { kind: 'paragraph', text: '对于需要持续登录的功能，应用可能将会话令牌等必要凭据保存在设备安全存储中。部分服务（例如 Rizline）可能根据你的操作在本地安全存储中保存用于重新登录的密码，并提供清理方式。' },
  { kind: 'paragraph', text: '登录、验证及授权过程中，必要的信息会直接发送至对应第三方服务。不同服务可能按照自身规则处理或保存这些信息。' },
  { kind: 'paragraph', text: 'rRanker 不会为了提供其他游戏的服务而擅自将你的登录凭据提供给无关平台。' },
  { kind: 'subheading', text: '个人曲库、偏好与缓存' },
  { kind: 'paragraph', text: '为了提供个人曲库及个性化功能，应用可能在设备上保存：' },
  { kind: 'paragraph', text: '• 收藏的歌曲、练习标记、自定义标签及预设；\n• 当前选择的游戏、账号和其他功能选项；\n• 主题、显示方式和应用设置；\n• 已查询的成绩、歌曲信息、谱面资源、图片及其他缓存；\n• 必要的本地运行状态和诊断信息。' },
  { kind: 'paragraph', text: '这些信息主要用于维持应用功能、保留个人设置、减少重复请求及支持离线查看部分已缓存内容。' },
  { kind: 'paragraph', text: '个人曲库支持本地备份的导出与导入。当前备份格式不包含登录凭据和游戏成绩缓存。' },
  { kind: 'subheading', text: '位置信息' },
  { kind: 'paragraph', text: '当你使用音游地图、附近机厅查询等功能时，rRanker 可能处理你选择的地图中心位置、搜索地点或经你授权取得的设备位置。' },
  { kind: 'paragraph', text: '你可以主动请求系统定位，也可以通过地图选点、地区或关键词搜索等方式使用部分地图功能。' },
  { kind: 'paragraph', text: '在你允许定位后，应用可能读取经纬度，并将用于搜索的坐标、范围及筛选条件发送给地图或机厅信息服务，例如 nearcade。' },
  { kind: 'paragraph', text: 'iOS 端使用 Apple MapKit；Android 端使用高德地图相关 SDK。相关服务可能按照其隐私政策处理地图查询、设备及位置信息。' },
  { kind: 'paragraph', text: 'rRanker 不以持续追踪用户行踪为目的，也不主动申请后台持续定位权限。你可以通过设备系统设置撤销定位授权。' },
  { kind: 'paragraph', text: '拒绝定位不会影响与位置无关的成绩查询、曲库、分析等核心功能。' },
  { kind: 'subheading', text: '图片、文件与剪贴板' },
  { kind: 'paragraph', text: '在使用二维码成绩同步、图片生成、谱面资源或个人曲库备份功能时，应用可能访问你主动选择的图片、文件或剪贴板内容。' },
  { kind: 'paragraph', text: '例如，选择玩家二维码图片时，应用可以在设备本地识别二维码，并在你执行相应同步操作时，将识别出的必要内容提交给相关成绩同步服务。' },
  { kind: 'paragraph', text: '生成成绩图片时，应用可能访问相关游戏数据及图片资源，并根据你的操作将生成结果保存到设备相册或分享至其他应用。' },
  { kind: 'paragraph', text: '应用不会以这些功能为由主动遍历与你选择无关的私人图片或文件。' },
  { kind: 'subheading', text: '诊断与网络信息' },
  { kind: 'paragraph', text: '为支持故障排查，rRanker 提供本地运行诊断功能。普通诊断记录默认关闭，启用后可能记录应用版本、设备平台、操作阶段、请求状态、错误类别及相关时间信息。必要的严重故障信息也可能保存在本地。' },
  { kind: 'paragraph', text: '诊断记录会尽可能排除密码、授权令牌和不必要的玩家资料。' },
  { kind: 'paragraph', text: '诊断信息不通过 rRanker 的独立遥测系统默认自动上传。只有当你主动使用分享功能时，相关日志才会通过你选择的分享方式发送给接收方。' },
  { kind: 'paragraph', text: '同时，访问第三方 API、下载资源或浏览官网时，相应服务器或网络服务提供者可能因正常网络通信获得 IP 地址、请求时间、客户端信息等必要网络数据。' },
  { kind: 'heading', text: '信息的使用目的' },
  { kind: 'paragraph', text: '我们处理上述信息主要为了：' },
  { kind: 'paragraph', text: '1. 完成第三方账号绑定、授权和登录状态维护；\n2. 查询、显示、分析游戏成绩和玩家资料；\n3. 根据你的主动操作执行成绩同步或上传；\n4. 保存个人曲库、偏好设置及必要缓存；\n5. 生成、保存或导出成绩图片和备份文件；\n6. 提供地图、机厅及位置搜索服务；\n7. 维护应用稳定性、诊断故障和改善功能表现；\n8. 履行适用法律法规要求的义务。' },
  { kind: 'paragraph', text: '我们不会出售你的个人信息，也不会以定向广告投放或跨应用行为追踪为目的处理你的游戏账号数据。' },
  { kind: 'paragraph', text: '对于需要你同意的个人信息处理活动，我们将在适用法律要求的情况下取得相应同意。你可以撤回相关授权，但撤回可能导致依赖该信息的功能无法继续使用。' },
  { kind: 'heading', text: '第三方服务' },
  { kind: 'subheading', text: '游戏与社区平台' },
  { kind: 'paragraph', text: 'rRanker 依赖多个独立的第三方平台实现不同游戏的账号验证、成绩查询和数据同步功能。' },
  { kind: 'paragraph', text: '根据你实际选择的游戏与功能，应用可能连接以下服务：' },
  { kind: 'paragraph', text: '• 水鱼查分器、落雪查分器及 Score Hub：用于舞萌 DX、中二节奏等游戏的玩家查询、账号授权和成绩同步。\n• TapTap、Kyou 及相关游戏云存档服务：用于 Phigros 的账号授权和成绩读取。\n• osu!：用于 OAuth 授权、玩家资料、成绩及谱面查询。\n• Majdata Net、Rizline：用于对应游戏的账号验证和数据读取。\n• Phira、MuseDash.moe、TUF 等社区服务：用于公开玩家信息、成绩及相关内容查询。' },
  { kind: 'paragraph', text: '不同服务接收的信息取决于实际操作，可能包括玩家标识、授权令牌、登录信息、查询条件、成绩记录以及完成操作所必需的其他数据。' },
  { kind: 'paragraph', text: '在使用舞萌 DX 成绩同步功能时，rRanker 可能通过 Score Hub 获取同步数据，并按照你的选择向水鱼查分器或落雪查分器提交相关成绩。' },
  { kind: 'paragraph', text: '部分 OAuth 授权可能包含数据写入权限。此类权限用于支持对应功能，不代表应用会在未经用户操作的情况下任意修改第三方账号数据。' },
  { kind: 'paragraph', text: '第三方平台对其自行处理的信息适用各自的隐私政策。建议你在登录或授权前阅读相应平台的规则。' },
  { kind: 'subheading', text: '高德地图' },
  { kind: 'paragraph', text: '为提供音游地图、地图展示、地点搜索等功能，Android 版本集成了高德开放平台的地图相关 SDK，包括轻量地图、搜索及定位组件。' },
  { kind: 'paragraph', text: 'SDK 提供方： 北京高德图强科技有限公司。' },
  { kind: 'paragraph', text: '使用目的： 地图显示、地理位置查询、机厅地点搜索及相关地图功能。' },
  { kind: 'paragraph', text: '可能处理的信息： 经纬度、地图搜索词、IP 地址、网络类型、Wi-Fi 及 GNSS 相关信息、设备与操作系统信息、应用名称及版本、设备标识信息（例如 OAID），以及实现相关地图服务所必需的其他信息。具体处理范围取决于 SDK 版本、系统环境、启用功能及授权状态。' },
  { kind: 'paragraph', text: '信息处理方式： SDK 可在用户设备上采集提供地图服务所需的信息，并按其服务规则与高德服务器通信。' },
  { kind: 'paragraph', text: 'Android 端在启用相关地图服务前提供独立说明与同意选项。若你不启用高德地图，仍可使用不依赖该 SDK 的机厅列表等功能。' },
  { kind: 'paragraph', text: '高德地图开放平台隐私权政策：\nhttps://lbs.amap.com/pages/privacy/' },
  { kind: 'subheading', text: 'Apple 地图' },
  { kind: 'paragraph', text: 'iOS 版本通过 Apple MapKit 提供地图展示及相关功能。Apple 可能根据相关请求处理提供地图服务所需的信息。' },
  { kind: 'paragraph', text: 'Apple 地图与隐私：\nhttps://www.apple.com/legal/privacy/data/zh-cn/apple-maps/' },
  { kind: 'subheading', text: 'nearcade 机厅信息' },
  { kind: 'paragraph', text: 'rRanker 使用 nearcade 提供的机厅信息接口查询地点及相关游戏设施信息。' },
  { kind: 'paragraph', text: '在进行附近查询时，可能向该服务发送地图中心经纬度、查询半径、游戏筛选条件以及其他必要查询参数。' },
  { kind: 'paragraph', text: '这些坐标可能来自系统定位，也可能来自你手动选择的地图位置。' },
  { kind: 'paragraph', text: '服务地址：https://nearca.de/api' },
  { kind: 'subheading', text: '资源分发与网站托管' },
  { kind: 'paragraph', text: 'rRanker 可能通过第三方对象存储、内容分发网络（CDN）及托管服务提供歌曲资源、图片、谱面素材、应用下载文件和官网静态内容。' },
  { kind: 'paragraph', text: '上述服务可能处理完成网络传输、安全防护与资源交付所必需的网络请求信息。' },
  { kind: 'paragraph', text: 'rRanker 官网目前采用静态页面架构，不提供独立的玩家账号登录功能。网站托管服务仍可能按照自身规则处理必要访问日志。' },
  { kind: 'heading', text: '信息存储与安全' },
  { kind: 'paragraph', text: 'rRanker 采用本地优先的数据存储设计。' },
  { kind: 'paragraph', text: '游戏成绩、个人曲库、用户偏好及缓存主要通过设备本地数据库或文件存储保存。必要的登录令牌和凭据使用操作系统提供的安全存储机制。' },
  { kind: 'paragraph', text: '我们将采取与项目规模和处理活动相适应的合理安全措施，降低信息未经授权访问、泄露或丢失的风险。' },
  { kind: 'paragraph', text: '本地信息通常在你继续使用相应功能期间保存，直到你执行删除、清理、解绑等操作，或设备系统根据其规则清除相应内容。' },
  { kind: 'paragraph', text: '你可以在应用内使用相关存储管理功能清理数据。卸载应用后的数据保留情况可能受到操作系统安全存储及设备备份机制的影响。' },
  { kind: 'paragraph', text: '需要注意的是，删除 rRanker 的本地缓存或解绑第三方账号，不等于删除第三方平台已经保存的账号、成绩或同步记录。' },
  { kind: 'paragraph', text: '第三方平台中的数据应通过相应平台提供的管理和删除方式处理。' },
  { kind: 'heading', text: '设备权限' },
  { kind: 'paragraph', text: 'rRanker 仅为实现对应功能而请求所需的设备权限，主要包括：' },
  { kind: 'paragraph', text: '位置权限： 用于按当前位置搜索附近机厅。可以拒绝或随时通过系统设置撤销。' },
  { kind: 'paragraph', text: '相册及文件访问权限： 用于读取你主动选择的二维码图片、导入文件，以及保存成绩图片或备份内容。' },
  { kind: 'paragraph', text: '网络访问： 用于登录、成绩查询、同步、地图和资源下载等在线功能。' },
  { kind: 'paragraph', text: '部分权限是否需要授权以及授权界面会随设备和操作系统版本有所不同。' },
  { kind: 'paragraph', text: '撤销非必要权限不会阻止你使用其他不依赖该权限的功能。' },
  { kind: 'heading', text: '跨境信息处理' },
  { kind: 'paragraph', text: '由于 rRanker 支持来自不同国家和地区的游戏与社区服务，你主动选择的第三方平台、地图服务或资源提供者可能在你所在国家或地区之外处理相关信息。' },
  { kind: 'paragraph', text: '例如，使用国际游戏账号、跨地区的云存档服务或其他第三方 API 时，必要的数据可能通过网络传输至相应服务所在地区。' },
  { kind: 'paragraph', text: '我们将依据适用法律要求处理由 rRanker 控制的跨境数据活动，并在法律要求时提供额外告知或取得必要同意。' },
  { kind: 'paragraph', text: '第三方服务对其接收的数据所采用的存储地区、保留期限与保障措施，以相应平台的政策和实际安排为准。' },
  { kind: 'heading', text: '你的权利与信息管理' },
  { kind: 'paragraph', text: '根据适用法律，你可能有权查阅、更正、删除与自己有关的个人信息，撤回同意，获取个人信息副本，或者对相关处理活动提出疑问。' },
  { kind: 'paragraph', text: '你可以通过以下方式管理 rRanker 中的信息：' },
  { kind: 'paragraph', text: '1. 在应用内解绑第三方账号，以移除对应的本地账号关联和相关凭据；\n2. 通过存储管理功能清理支持删除的成绩缓存、资源或诊断记录；\n3. 使用个人曲库备份功能导出相关本地数据；\n4. 在设备系统设置中调整位置、照片等访问权限；\n5. 前往相应第三方平台撤销 OAuth 授权或申请删除第三方账号数据；\n6. 通过本政策列出的联系方式提出其他隐私相关请求。' },
  { kind: 'paragraph', text: '对于我们实际控制的信息，我们将依据适用法律核实和处理你的请求。' },
  { kind: 'paragraph', text: '对于第三方平台独立保存的信息，我们可能无法直接执行删除或更正。你需要按照相关服务的规定向其提出申请。' },
  { kind: 'heading', text: '未成年人保护' },
  { kind: 'paragraph', text: 'rRanker 不以主动收集儿童个人信息为目的。' },
  { kind: 'paragraph', text: '如果你尚未达到适用法律规定的个人信息处理同意年龄，请在监护人的指导下使用涉及账号登录、个人信息或第三方授权的功能，并在法律要求时取得监护人同意。' },
  { kind: 'paragraph', text: '如果我们发现存在违反适用法律的未成年人个人信息处理行为，将采取相应措施，包括停止相关处理、删除我们控制范围内的不当收集信息等。' },
  { kind: 'heading', text: '政策更新' },
  { kind: 'paragraph', text: '我们可能因应用功能、数据来源、第三方服务或法律要求的变化而更新本政策。' },
  { kind: 'paragraph', text: '更新后的政策将在官方网站或应用内公布，并标明最近更新日期。' },
  { kind: 'paragraph', text: '对于涉及个人信息处理目的、方式或范围的重大变化，我们将在适用法律要求时以适当方式告知用户，并在必要时重新取得同意。' },
  { kind: 'heading', text: '联系我们' },
  { kind: 'paragraph', text: '如果你对本政策、rRanker 的个人信息处理方式或相关权利行使有疑问，可以通过以下渠道联系项目开发者。' },
  { kind: 'paragraph', text: '应用名称： rRanker\n开发者： rRanker 项目开发者（GitHub：kckc7887）\n个人信息处理者：陈彦柏\n隐私联系邮箱：hrddzhz@gmail.com\n官方网站： https://rranker.com/\n项目仓库： https://github.com/kckc7887/rRanker' },
  { kind: 'paragraph', text: '我们将在核实请求后，根据适用法律要求及实际处理能力予以回复。' },
  { kind: 'paragraph', text: '本政策说明 rRanker 对信息的处理方式，不取代相关游戏、社区平台、地图服务或其他第三方提供者各自适用的隐私政策。' },
] as const;

export default function PrivacyPolicyScreen() {
  const theme = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ title: '隐私政策' }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={[styles.page, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
      >
        {PRIVACY_POLICY.map((block, index) => (
          <Text
            key={index}
            style={[
              styles[block.kind],
              { color: block.kind === 'date' ? theme.textMuted : block.kind === 'paragraph' ? theme.textSecondary : theme.text },
            ]}
          >
            {block.text}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 12 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '800' },
  date: { fontSize: 13, lineHeight: 20 },
  heading: { fontSize: 19, lineHeight: 28, fontWeight: '700', marginTop: 16 },
  subheading: { fontSize: 16, lineHeight: 24, fontWeight: '700', marginTop: 8 },
  paragraph: { fontSize: 15, lineHeight: 24 },
});

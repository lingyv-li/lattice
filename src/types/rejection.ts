export interface RejectionSnapshot {
    /** Group name the AI proposed */
    groupName: string;
    /** Tab titles + hostnames only — no full URLs */
    tabs: { title: string; hostname: string }[];
    /** ISO timestamp */
    timestamp: string;
}

// products/product.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
} from 'typeorm';

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'text', nullable: false })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'text', nullable: true })
    jiraIssueKey?: string;

    @Column({ type: 'text', nullable: true })
    jiraIssueId?: string;

    @Column({ type: 'text', nullable: true })
    ticketStatus?: string;

    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt?: Date;

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamp' })
    updatedAt: Date;

    @Column({ type: 'text', nullable: true })
    jiraSyncStatus?: 'OK' | 'FAILED';

    @Column({ type: 'timestamp', nullable: true })
    jiraLastSyncAt?: Date;
}

